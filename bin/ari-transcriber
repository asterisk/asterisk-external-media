#!/usr/bin/env node
/*
 *   Copyright 2019 Sangoma Technologies Corporation
 *   George Joseph <gjoseph@digium.com>
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*
 * This script processes the command line arguments and calls
 * the transcriber.
 */

var transcriber = require('../lib/ari-transcriber.js');

process.title = 'ari-transcriber';
require(`yargs`)
	.example(`node $0`)
	.recommendCommands()
	.help()
	.command(`$0 [options] <dialstring>`, "Start the transcription server",
		(yargs) => {
			yargs.example("$0 --help --format=slin16 --sslCert=/etc/letsencrypt/live/myserver/fullchain.pem --sslKey=/etc/letsencrypt/live/myserver/privkey.pem --wssPort=39990 --speakerDiarization 'Local/1170' ")
			yargs.wrap(yargs.terminalWidth());
			yargs.positional('dialstring', {describe: 'Extension to dial such as "Local/1234"'});
		},
		opts => {
			new transcriber.AriTranscriber(opts);
		}
	)
	.options({
		format: {
			alias: 'f',
			default: 'ulaw',
			global: true,
			requiresArg: true,
			description: "Asterisk format/codec",
			choices: ['ulaw', 'slin16'],
			group: "Incoming Audio Server",
			type: 'string',
		},
		listenServer: {
			alias: 'l',
			default: '127.0.0.1:9999',
			global: true,
			requiresArg: true,
			description: "Address and port on which to listen for audio from Asterisk",
			group: "Incoming Audio Server",
			type: 'string',
		},
		speechModel: {
			default: 'default',
			choices: ['phone_call', 'video', 'default'],
			global: true,
			requiresArg: true,
			description: "Google Speech API model",
			group: "Speech",
			type: 'string',
		},
		speechLang: {
			default: 'en-US',
			choices: ['en-US', 'fr-CA'],
			global: true,
			requiresArg: true,
			description: "BCP-47 Language code.  en-US, fr-CA, etc.",
			group: "Speech",
			type: 'string',
		},
		speakerDiarization: {
			default: false,
			global: true,
			requiresArg: false,
			group: "Speech",
			description: "Outputs words associated to speaker index to console",
			type: 'boolean',
		},
		ariServerUrl: {
			alias: 'a',
			default: 'http://127.0.0.1:8088',
			global: true,
			requiresArg: true,
			description: "The URL for the Asterisk instance",
			group: "ARI",
			type: 'string',
		},
		ariUser: {
			alias: 'u',
			default: 'asterisk',
			global: true,
			requiresArg: true,
			description: "The user configured in ari.conf",
			group: "ARI",
			type: 'string',
		},
		ariPassword: {
			alias: 'p',
			default: 'asterisk',
			global: true,
			requiresArg: true,
			description: "The password for the user configured in ari.conf",
			group: "ARI",
			type: 'string',
		},
		audioOutput: {
			alias: 'o',
			global: true,
			requiresArg: true,
			description: "A file into which the raw audio from Asterisk can be written",
			type: 'string',
		},
		sslCert: {
			global: true,
			requiresArg: true,
			group: "Transcription WebSocket",
			description: "WebSocket secure server (wss) certificate. If omitted, a non-secures (ws) websocket server will be created",
			implies: "sslKey",
			type: 'string',
		},
		sslKey: {
			global: true,
			requiresArg: true,
			group: "Transcription WebSocket",
			description: "WebSocket secure server key. Must be supplied if sslCert is ssplied",
			implies: "sslCert",
			type: 'string',
		},
		wssPort: {
			global: true,
			requiresArg: true,
			description: "WebSocket server port.  If omitted, no websocket server will be started",
			group: "Transcription WebSocket",
			type: 'number',
		}
	})
	.strict().argv;
