import { Env, send_webhook, do_sign, StreamConsole } from './utils'

async function main(env: Env, cons: Console = console) {
    var users = JSON.parse(env.USERS);
    for (var u in users) {
        var username = users[u].username;
        var password = users[u].password;
        cons.info(`[${username}] Signing...`);
        var result = await do_sign(env, username, password);
        if (result.success) {
            cons.info(`[${username}] Sign Success: ${result.total} GB (+${result.sign} GB) - ${result.msg}`);
            await send_webhook(env, {
                embeds: [
                    {
                        title: `[${username}] HayFrp Auto Sign Finished! (+${result.sign} GB)`,
                        fields: [
                            {
                                name: 'SignFlow',
                                value: `${result.sign} GB`,
                                inline: true,
                            },
                            {
                                name: 'TotalFlow',
                                value: `${result.total} GB`,
                                inline: true,
                            },
                            {
                                name: 'Message',
                                value: result.msg,
                                inline: false,
                            }
                        ]
                    }
                ]
            }, cons);
        } else {
            if (result.msg) {
                // 失败
                cons.error(`[${username}] Sign Failed: ${result.msg}`);
                await send_webhook(env, {
                    embeds: [
                        {
                            title: `[${username}] HayFrp Auto Sign Failed!`,
                            description: result.msg
                        }
                    ]
                }, cons);
            } else {
                // 只是已经签到过了
                cons.warn(`[${username}] Already Signed!`);
                await send_webhook(env, {
                    embeds: [
                        {
                            title: `[${username}] (HayFrp) Already signed!`,
                            description: result.msg
                        }
                    ]
                }, cons);
            }
        }
    }
    cons.info(`Finished!`);
}



export default {
    async fetch(req, env) {
        var url = new URL(req.url);
        var raw_access_key = env.ACCESS_KEY || 'disabled';
        var access_key = raw_access_key.startsWith('/') ? raw_access_key : '/' + raw_access_key;
        if (url.pathname === access_key && access_key != '/disabled') {
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const stream = new StreamConsole(writer);
            main(env, stream).finally(() => {
                writer.close();
            })
            return new Response(readable, {
                headers: {
                    'Content-Type': 'text/plain',
                    'Transfer-Encoding': 'chunked',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                }
            })
        } else {
            return Response.redirect('https://github.com/wyf9/hayfrp-auto-sign', 301)
        }
    },

    async scheduled(event, env): Promise<void> {
        console.info(`Trigging scheduled task at ${event.scheduledTime} (${event.cron})`);
        await main(env);
    },
} satisfies ExportedHandler<Env>;
