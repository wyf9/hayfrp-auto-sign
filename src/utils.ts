export interface Env {
    API_URL: string;
    WEBHOOK_URL: string;
    USERS: string;
    ACCESS_KEY: string;
}

function sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1000 * seconds));
}

export async function fetch_with_retry(input: RequestInfo | URL, init?: RequestInit<RequestInitCfProperties>, retries: number = 3, seconds: number = 1) {
    for (var left = retries; left > 0; left--) {
        try {
            var resp = await fetch(input, init);
            if (!resp.ok && left > 1) {
                if (resp.status === 429) {
                    await sleep(Number(resp.headers.get('Retry-After') || seconds));
                } else {
                    await sleep(seconds);
                }
                continue;
            } else {
                return resp;
            }
        } catch (err) {
            if (left === 1) {
                throw err;
            } else {
                await sleep(seconds);
                continue;
            }
        }
    }
    throw 'Max retries reached!';
}

export async function send_webhook(env: Env, data: object, cons: Console = console) {
    if (env.WEBHOOK_URL && !(env.WEBHOOK_URL === 'disabled')) {
        try {
            var resp = await fetch_with_retry(env.WEBHOOK_URL, {
                method: 'POST',
                body: JSON.stringify(data),
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            cons.log(`Sent webhook to ${env.WEBHOOK_URL}: ${resp.status}`);
        } catch (err) {
            cons.error(`Send webhook failed: ${err}`);
        }
    }
}

export async function send_api_request(env: Env, route: string, data: object | null = null, method: string = 'POST') {
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

export async function do_sign(env: Env, username: string, password: string) {
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
            return { success: true, msg: resp.message, sign: resp.signflow || resp.flow, total: resp.flow };
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

export class StreamConsole implements Console {
    private writableStream: WritableStreamDefaultWriter;

    constructor(writableStream: WritableStreamDefaultWriter) {
        this.writableStream = writableStream;
    }

    info = (...args: any[]): void => {
        const msg = args.join(' ');
        console.info(msg);
        this.writableStream.write(new TextEncoder().encode(`[INFO] ${msg}\n`)).catch(console.error);
    };

    warn = (...args: any[]): void => {
        const msg = args.join(' ');
        console.warn(msg);
        this.writableStream.write(new TextEncoder().encode(`[WARN] ${msg}\n`)).catch(console.error);
    };

    error = (...args: any[]): void => {
        const msg = args.join(' ');
        console.error(msg);
        this.writableStream.write(new TextEncoder().encode(`[ERROR] ${msg}\n`)).catch(console.error);
    };

    // 其他 Console 方法的空实现
    assert = (condition?: boolean, ...data: any[]): void => { };
    clear = (): void => { };
    count = (label?: string): void => { };
    countReset = (label?: string): void => { };
    debug = (...data: any[]): void => { };
    dir = (item?: any, options?: any): void => { };
    dirxml = (...data: any[]): void => { };
    group = (...data: any[]): void => { };
    groupCollapsed = (...data: any[]): void => { };
    groupEnd = (): void => { };
    log = this.info;
    table = (tabularData?: any, properties?: string[]): void => { };
    time = (label?: string): void => { };
    timeEnd = (label?: string): void => { };
    timeLog = (label?: string, ...data: any[]): void => { };
    trace = (...data: any[]): void => { };
    timeStamp = (): void => { };
}
