const WebSocket = require('ws');
const socket = new WebSocket('ws://localhost:8080');
const target = new WebSocket('ws://localhost:8080');

const window = {};
const document = { body: true, head: true, createElement: function() {} };
const navigator = { userAgent: 'get trolled.' };

var targetDiscriminator = null;
target.on('open', function() {
    console.log('Starting antibot process...');
    target.send(JSON.stringify({ header: 'START_PROCESS' }));
});

target.on('message', function(data) {
    data = JSON.parse(data);
    console.log(data);

    switch (data.header) {
        case 'JS_CHALLENGE': {
            const { code } = data.data;
            target.send(JSON.stringify({
                header: 'JS_CHALLENGE_REPLY',
                data: { result: eval(code), },
            }));
            break;
        }
        case 'PASSED': {
            console.log('Socket connection has opened. Registering...');
            target.send(JSON.stringify({
                header: 'REGISTER',
                data: {
                    username: 'target',
                    // special: 'INSERT_MODERATOR_TOKEN',
                },
            }));
            console.log('Sent registration request.');
            break;
        }
        case 'REGISTER_REJECT': {
            console.error('Registration failed.', data);
            break;
        }
        case 'REGISTER_ACCEPT': {
            const { token } = data.data;
            console.log('Retreived access token! Logging in...');
            target.send(JSON.stringify({
                header: 'AUTHORIZE',
                data: { token, },
            }));
            break;
        }
        case 'AUTH_REJECT': {
            console.error('Authorization failed.', data);
            break;
        }    
        case 'AUTH_ACCEPT': {
            console.log('Authorization accepted.');
            targetDiscriminator = data.data.message.split('#')[1].replace('.', '');
            console.log(targetDiscriminator);
            break;
        }
        case 'MODERATOR_ACTION': {
            setTimeout(() => {
                target.send(JSON.stringify({
                    header: 'SEND_MESSAGE',
                    data: { message: 'testing.' },
                }));
            }, 5000);
        }
    }
});

socket.on('open', function() {
    console.log('Starting antibot process...');
    socket.send(JSON.stringify({ header: 'START_PROCESS' }));
});

socket.on('message', function(data) {
    data = JSON.parse(data);
    console.log(data);

    switch (data.header) {
        case 'JS_CHALLENGE': {
            const { code } = data.data;
            socket.send(JSON.stringify({
                header: 'JS_CHALLENGE_REPLY',
                data: { result: eval(code), },
            }));
            break;
        }
        case 'PASSED': {
            console.log('Socket connection has opened. Registering...');
            socket.send(JSON.stringify({
                header: 'REGISTER',
                data: {
                    username: 'altanis',
                    special: 'INSERT_MODERATOR_TOKEN',
                },
            }));
            console.log('Sent registration request.');
            break;
        }
        case 'REGISTER_REJECT': {
            console.error('Registration failed.', data);
            break;
        }
        case 'REGISTER_ACCEPT': {
            const { token } = data.data;
            console.log('Retreived access token! Logging in...');
            socket.send(JSON.stringify({
                header: 'AUTHORIZE',
                data: { token, },
            }));
            break;
        }
        case 'AUTH_REJECT': {
            console.error('Authorization failed.', data);
            break;
        }    
        case 'AUTH_ACCEPT': { 
            console.log('Authorized successfully. Attempting to send a message.');
            const x = setInterval(function() {
                if (targetDiscriminator == null) return;
                socket.send(JSON.stringify({
                    header: 'SEND_MESSAGE',
                    data: { message: `/mute ${targetDiscriminator}`, },
                }));
                clearInterval(x);
            }, 500);
            break;
        }
    }
});