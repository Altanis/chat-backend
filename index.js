const { Server } = require('ws');
const fetch = require('node-fetch');
const ms = require('ms');
const prettyms = require('pretty-ms');
const dayjs = require('dayjs');
const { obfuscate } = require('javascript-obfuscator');

const wss = new Server({ port: process.env.PORT || 8080 }); // IP will only work if t
wss.users = {}; 
wss.blacklist = [];

Object.filter = (obj, predicate) => 
    Object.keys(obj)
          .filter( key => predicate(obj[key]) )
          .reduce( (res, key) => (res[key] = obj[key], res), {} );

wss.on('connection', function(socket, request) {
    console.log('A new client has connected to the server.');

    socket.blacklist = function() {
        wss.blacklist.push(socket.ip);
        socket.close();
    };

    socket.ip = request.headers['x-forwarded-for'] || 
        request.connection.remoteAddress || 
        request.socket.remoteAddress ||
        request.connection.socket.remoteAddress;
    socket.authorized = false;

    if (wss.blacklist.includes(socket.ip)) return socket.close();

    setInterval(() => {
        if (!socket.data) return;
        if (socket.data.messageCooldown != 0) socket.data.messageCooldown -= 1;
        if (socket.data.mute.time != 0) socket.data.mute.time -= 1000;
        if (socket.data.mute.time <= 0 && socket.data.mute.muted) {
            socket.send(JSON.stringify({ header: 'SYSTEM_MESSAGE', data: { message: 'Your mute has been lifted.', } }));
        }
    }, 1000);

    if (!request.headers.upgrade ||
        !request.headers.connection ||
        !request.headers.host ||
        !request.headers.pragma ||
        !request.headers["cache-control"] ||
        !request.headers["user-agent"] ||
        !request.headers["sec-websocket-version"] ||
        !request.headers["accept-encoding"] ||
        !request.headers["accept-language"] ||
        !request.headers["sec-websocket-key"] ||
        !request.headers["sec-websocket-extensions"]) return socket.blacklist();
    
    fetch(`https://ipqualityscore.com/api/json/ip/ZwS61NRyh2WNRpZrzQLKmMYD5mxhyxUf/${socket.ip}`).then(r => r.json()).then(data => {
        if (data.vpn ||
            data.tor ||
            data.active_vpn ||
            data.active_tor) {
                const interval = setInterval(() => {
                    if (socket.readyState != 1) return;
                    
                    socket.send(JSON.stringify({
                        header: 'CONNECTION_CLOSE',
                        data: { message: 'Our servers have detected you have a proxy enabled. Due to the prominence of botting, we do not allow proxies. Please disable it, and then reload.' },
                    }));
                    socket.close();
                    clearInterval(interval);
                }, 150);
            }
    });

    socket.on('message', function(data) {
        console.log(data);
        try {
            data = JSON.parse(data);
        } catch (error) {
            return socket.blacklist();
        }

        switch (data.header) {
            case 'START_PROCESS': {
                const randomInteger = (min, max) => { 
                    let inBetween = (max - min) + 1; 
                    let random = Math.floor(Math.random() * inBetween); 
                    return max - random; // Returns max subtracted by random
                };

                const checks = ['constructor', 'window', 'document', 'document.body', 'document.head', 'document.createElement', 'navigator.userAgent.indexOf(\'HeadlessChrome\') != -1']; 
                let integers = [];
                
                checks.forEach(_ => {
                    integers.push(randomInteger(1, 1e10));
                });

                let evalStr = obfuscate(`let orgNum = 0;
                if (constructor) orgNum += ${integers[0]};
                if (window) orgNum += ${integers[1]};
                if (document) orgNum += ${integers[2]};
                if (document.body) orgNum += ${integers[3]};
                if (document.head) orgNum += ${integers[4]};
                if (document.createElement) orgNum += ${integers[5]}
                if (!(navigator.userAgent.indexOf('HeadlessChrome') != -1)) orgNum += ${integers[6]}; orgNum;`, {
                    compact: false,
                    controlFlowFlattening: true,
                    controlFlowFlatteningThreshold: 1,
                    numbersToExpressions: true,
                    simplify: true,
                    shuffleStringArray: true,
                    splitStrings: true,
                    stringArrayThreshold: 1
                }).getObfuscatedCode();
                socket.challengeResult = integers.reduce((a, b) => a + b);
                console.log(socket.challengeResult);

                socket.send(JSON.stringify({ header: 'JS_CHALLENGE', data: { code: evalStr, } }));
                break;
            }
            case 'JS_CHALLENGE_REPLY': {
                const { result } = data.data;
                if (socket.challengeResult != result) return socket.close();

                socket.authorized = true;
                socket.send(JSON.stringify({ header: 'PASSED', }));
                break;
            }
        }

        if (!socket.authorized) return;
        switch (data.header) {
            case 'REGISTER': {
                const { username, special } = data.data;
                if (typeof username != 'string') return socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'Username must be of type String.', } }));
                if (username.length > 15) return socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'Username length cannot be greater than 15 characters.', } }));

                let pass = true;
                ['bmln', 'bmlnZ2Vy', 'ZmFn', 'ZmFnZ290', 'amV3'].forEach(function(word) {
                    word = Buffer.from(word, 'base64').toString(); // Do not do socket if you are sensitive LOL.
                    if (username.includes(word)) {
                        socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'A slur was detected in your name. Please give a new name.' } }));
                        pass = false;
                    }
                });
                if (!pass) return;
                

                const discriminator = Math.random().toString().substring(2).slice(0, 4);
                const token = Buffer.from(`${username}#${discriminator} + ${Date.now()}`).toString('base64');

                wss.users[token] = {
                    messages: [],
                    messageCooldown: 0,
                    infractions: 0,
                    mute: { time: 0, muted: false },
                    username,
                    discriminator,
                    token,
                    status: 'Online',
                    accessLevel: special == 'INSERT_MODERATOR_TOKEN' ? 1 : (special == 'INSERT_ADMINISTRATOR_TOKEN' ? 2 : 0),
                };

                socket.send(JSON.stringify({ header: 'REGISTER_ACCEPT', data: { message: `Registration was successful. ${wss.users[token].accessLevel == 1 ? `You have received ${wss.users[token].accessLevel == 2 ? 'administrator' : 'moderator'} permissions.` : ''}`, token, }}));
                break;
            }
            case 'AUTHORIZE': {
                const { token } = data.data;
                if (typeof token != 'string' || !wss.users[token]) return socket.send(JSON.stringify({ header: 'AUTH_REJECT', data: { message: 'The token provided was invalid.', } }));

                socket.data = wss.users[token];
                socket.send(JSON.stringify({ header: 'AUTH_ACCEPT', data: { message: `Logged in as ${socket.data.username}#${socket.data.discriminator}.` } }));
                break;
            }
            case 'SEND_MESSAGE': {
                socket.data.messageCooldown++;
                if (socket.data.messageCooldown >= 3) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: `You are being ratelimited. Please wait ${socket.data.messageCooldown} seconds to speak again.` } }));
                if (socket.data.mute.muted) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: `You are still muted. Please wait ${prettyms(socket.data.mute.time, { verbose: true })} to speak again.`, } }));

                const { message } = data.data;
                if (typeof message != 'string') return socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'Message must be of type String.', } }))
                ['bmln', 'bmlnZ2Vy', 'ZmFn', 'ZmFnZ290', 'amV3'].forEach(function(word) {
                    word = Buffer.from(word, 'base64').toString(); // Do not do socket if you are sensitive LOL.
                    if (message.includes(word)) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: 'Your message failed to deliver due to it containing a slur.' } }));
                });

                if (message.length < 1 || message.length > 150) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: 'Character count must be within bounds 1-150.', } }));

                wss.clients.forEach(client => client.send(JSON.stringify({ header: 'MESSAGE_ACCEPT', data: { 
                    message, 
                    author: `${socket.data.username}#${socket.data.discriminator}`, 
                    timestamp: dayjs().format('hh:mm:ss'),
                }})));

                if (message.startsWith('/') && socket.data.accessLevel) {
                    const args = message.split(' '),
                        cmd = args.shift().toLowerCase().replace('/', '');

                    switch (cmd) {
                        case 'mute': {
                            const discriminator = args[0];
                            const [ key, value ] = Object.entries(Object.filter(wss.users, data => { return data.discriminator == discriminator }))[0];
                            if (!key || !value) return socket.send(JSON.stringify({ header: 'COMMAND_REJECT', data: { message: 'Failed to parse argument Discriminator: Could not find a user with specified discriminator.', } }));
                            if (socket.data.accessLevel <= value.accessLevel) return socket.send(JSON.stringify({ header: 'COMMAND_REJECT', data: { message: 'Failed to execute command: Target has a higher or equal access level than you.', } }));

                            let time = args[1];
                            if (!time) time = '10m';
                            try { time = ms(time); } catch (er) { time = 10000; };

                            wss.users[key].mute = {
                                time,
                                muted: true,
                            };

                            const target = [...wss.clients].filter(client => { return client.data?.discriminator == discriminator })[0];
                            target?.send(JSON.stringify({ header: 'MODERATOR_ACTION', data: { message: `You have been muted for ${prettyms(time, { verbose: true })}.` }, }));
                            wss.clients.forEach(client => client.send(JSON.stringify({ header: 'SYSTEM_MESSAGE', data: { message: `${target.data?.username}#${target.data?.discriminator} has been muted for ${prettyms(time, { verbose: true })}.`, } })));
                        }
                    }
                }
                break;
            }
            case 'CHANGE_STATUS': {
                const { status } = data.data;
                if (!['Online', 'Idle', 'Do Not Disturb', 'Offline'].includes(status)) return socket.send(JSON.stringify({ header: 'STATUS_REJECT', data: { message: 'Invalid status was provided.' } }));

                socket.data.status = status;
                socket.send(JSON.stringify({ header: 'STATUS_ACCEPT', data: { message: 'Status was changed successfully.' } }));
                break;
            }
            case 'PING': {
                socket.send(JSON.stringify({ header: 'PONG' }));
                break;
            }
            case 'USERCOUNT': {
                socket.send(JSON.stringify({ header: 'CLIENTS', data: { count: wss.clients.size } }));
            }
        }
    });

    socket.on('error', console.error);
    socket.on('close', function() {
        if (socket.data) socket.data.status = 'Offline';
    });
});

wss.on('error', console.error);