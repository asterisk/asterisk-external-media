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

const rtp = require('./rtp-udp-server');
const provider = require('./google-speech-provider');
const ari = require('./ari-controller');
const WebSocket = require('ws'); 
const fs = require('fs');
const https = require('https');
const http = require('http');

class AriTranscriber {
	constructor(opts) {
		this.opts = opts;
		// Run it.
		this.transcriber();
	}
	
	// The WebSocket server serves up the transcription.
	startWebsocketServer() {
		this.webServer = this.opts.sslCert ? 
		https.createServer({
			  cert: fs.readFileSync(this.opts.sslCert),
			  key: fs.readFileSync(this.opts.sslKey)
		}) : https.createServer();
		
		this.wssServer = new WebSocket.Server({ server: this.webServer });
		this.wssServer.on('connection', function(ws, req) {
			console.log("Connection from: ", req.connection.remoteAddress);
		});
		
		this.webServer.listen(this.opts.wssPort);
	}
	
	/*
	 * The transcriptCallback simply passes any text received from the
	 * speech provider to any client connected to the WebSocket server.  
	 */ 
	transcriptCallback(text, isFinal) {
		if (isFinal && this.wssServer) {
			this.wssServer.clients.forEach(function each(client) {
				if (client.readyState === WebSocket.OPEN) {
					client.send(text);
				}
			});
		}
	}

	/*
	 * The resultsCallback is just an example of how Google identifies
	 * speakers if you have speakerDiarization enabled.  We don't do
	 * anything with this other than display the raw results on the console.
	 */ 
	resultsCallback(results) {
		if (results[0].isFinal) {
			const transcription = results
				.map(result => result.alternatives[0].transcript)
				.join('\n');
			console.log(`Transcription: ${transcription}`);			
			const wordsInfo = results[0].alternatives[0].words;
			wordsInfo.forEach(a =>
				console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`)
			);			
		}
	}

	// The main wrapper
	async transcriber() {
		let speechEncoding;
		let speechRate;
		let swap16 = false;
		
		switch(this.opts.format) {
		case "ulaw":
			speechEncoding = "MULAW";
			speechRate = 8000;
			break;
		case "slin16":
			speechEncoding = "LINEAR16";
			speechRate = 16000;
			swap16 = true;
			break;
		default:
			console.error(`Unknown format ${this.opts.format}`);
			return;
		}

		// Create the ARI Controller instance but don't start it yet.
		console.log(`Creating ARI Controller to Asterisk instance ${this.opts.ariServerUrl}`);
		this.ariController = new ari.AriController(this.opts);
		this.ariController.on('close', () => {
		    this.audioServer.close();
		    if (this.webServer) {
			    this.webServer.close();
		    }
		    process.exit(0);
		});
		
		// Catch CTRL-C so we can hang up any channels and destroy any bridges.
		process.on('SIGINT', async () => {
		    await this.ariController.close();
		    process.exit(0);
		});	
		
		// If wssPort was specified, start the WebSocket server.
		if (this.opts.wssPort > 0) {
			console.log(`Starting ${this.opts.sslCert ? "secure " : ""}transcription websocket server on port ${this.opts.wssPort}`);
			this.startWebsocketServer();
		}

		// Start the server that receives audio from Asterisk. 
		console.log(`Starting audio listener on ${this.opts.listenServer}`);
		this.audioServer = new rtp.RtpUdpServerSocket(this.opts.listenServer, swap16,
				this.opts.audioOutput || false);

		
		console.log("Starting speech provider");
		let config = {
		    	encoding: speechEncoding,
		    	sampleRateHertz: speechRate,
		    	languageCode: this.opts.speechLang,
		    	audioChannelCount: 1,
	 	    	model: this.opts.speechModel,
		    	useEnhanced: true,
		    	profanityFilter: false,
		    	enableAutomaticPunctuation: true,
		    	enableWordTimeOffsets: true,
		    	metadata: {
		    		interactionType: 'DISCUSSION',
		    		microphoneDistance: 'MIDFIELD',
		    		originalMediaType: 'AUDIO',
		    		recordingDeviceName: 'ConferenceCall',
		    	}
		};
		if (this.opts.speakerDiarization) {
			config.enableSpeakerDiarization = true;
			config.diarizationSpeakerCount = 5;
		}
		
		// Start the speech provider passing in the audio server socket.
		this.speechProvider = new provider.GoogleSpeechProvider(config, this.audioServer,
				(text, isFinal) => {
					this.transcriptCallback(text, isFinal);			
				},
				(results) => {
					if (this.opts.speakerDiarization) {
						this.resultsCallback(results);
					}
				},
		);
		
		// Kick the whole process off by creating the channels and bridges.
		console.log("Creating Bridge and Channels");
		await this.ariController.connect();

		console.log("Processing");
	}
}

module.exports.AriTranscriber = AriTranscriber;


 
