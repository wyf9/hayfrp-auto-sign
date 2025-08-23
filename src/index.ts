export interface Env {
    API_URL: string;
    WEBHOOK_URL: string;
    USERS: string;
}

async function send_webhook(env: Env, data: object) {
    if (env.WEBHOOK_URL && !(env.WEBHOOK_URL === 'disabled')) {
        try {
            var resp = await fetch(env.WEBHOOK_URL, {
                method: 'POST',
                body: JSON.stringify(data),
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            console.log(`Sent webhook to ${env.WEBHOOK_URL}: ${resp.status}`);
        } catch (err) {
            console.error(`Send webhook failed: ${err}`);
        }
    }
}

async function send_api_request(env: Env, route: string, data: object | null = null, method: string = 'POST') {
    var api_base = env.API_URL || 'https://api.hayfrp.com';
    try {
        var resp = await fetch(`${api_base.endsWith('/') ? api_base : api_base + '/'}${route}`, {
            method: method,
            body: data ? JSON.stringify(data) : null,
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                waf: 'off', // 绕过雷池防火墙
            },
        });
        if (resp.ok) {
            var json: any = await resp.json();
            return json;
        } else {
            throw `HayFrp API Response isn't 200: ${resp.status}`;
        }
    } catch (err) {
        throw `HayFrp API Request error: ${err}`;
    }
}

async function do_sign(env: Env, username: string, password: string) {
    try {
        var resp = await send_api_request(env, 'user', {
            type: 'login',
            user: username,
            passwd: password,
        });
        if (resp.status === 403) {
            return { success: false, msg: `Wrong Password (403)` };
        } else if (resp.status === 404) {
            return { success: false, msg: `User doesn't exist (404)` };
        } else if (resp.status === 500) {
            return { success: false, msg: `Internal Server Error (500)` };
        } else if (resp.status !== 200) {
            return { success: false, msg: `Unknown error code: ${resp.status}` };
        }
        var token = resp.token;
        var resp = await send_api_request(env, 'user', {
            type: 'sign',
            csrf: token,
        });
        if (resp.status === 200) {
            return { success: true, msg: resp.message, sign: resp.signflow, total: resp.flow };
        } else if (resp.status === 403) {
            return { success: false, msg: null } // 已经签到
        } else if (resp.status === 404) {
            return { success: false, msg: `Token Expired (404)` };
        } else if (resp.status === 500) {
            return { success: false, msg: `Internal Server Error (500)` };
        } else {
            return { success: false, msg: `Unknown error code: ${resp.status}` };
        }
    } catch (err) {
        return { success: false, msg: `Request Error: ${err}` };
    }
}

export default {
    async fetch(req) {
        const url = new URL(req.url);
        url.pathname = '/__scheduled';
        url.searchParams.append('cron', '* * * * *');
        return new Response(`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`);
    },

    async scheduled(event, env, ctx): Promise<void> {
        console.log(`Trigging scheduled task at ${event.scheduledTime} (${event.cron})`);
        var users = JSON.parse(env.USERS);
        for (var u in users) {
            var username = users[u].username;
            var password = users[u].password;
            console.log(`[${username}] Signing...`);
            var resp = await do_sign(env, username, password);
            if (resp.success) {
                console.log(`[${username}] Sign Success: ${resp.total} GB (+${resp.sign} GB) - ${resp.msg}`);
                await send_webhook(env, {
                    embeds: [
                        {
                            title: `[${username}] HayFrp Auto Sign Finished! (+${resp.sign} GB)`,
                            fields: [
                                {
                                    name: 'SignFlow',
                                    value: `${resp.sign} GB`,
                                    inline: true,
                                },
                                {
                                    name: 'TotalFlow',
                                    value: `${resp.total} GB`,
                                    inline: true,
                                },
                                {
                                    name: 'Message',
                                    value: resp.msg,
                                    inline: false,
                                }
                            ]
                        }
                    ]
                });
            } else {
                if (resp.msg) {
                    // 失败
                    console.error(`[${username}] Sign Failed: ${resp.msg}`);
                    await send_webhook(env, {
                        embeds: [
                            {
                                title: `[${username}] HayFrp Auto Sign Failed!`,
                                description: resp.msg
                            }
                        ]
                    });
                } else {
                    // 只是已经签到过了
                    console.warn(`[${username}] Already Signed!`);
                    await send_webhook(env, {
                        embeds: [
                            {
                                title: `[${username}] (HayFrp) Already signed!`,
                                description: resp.msg
                            }
                        ]
                    })
                }
            }
        }

        console.log(`Finished!`);
    },
} satisfies ExportedHandler<Env>;
