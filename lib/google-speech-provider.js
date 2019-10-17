/*
 * Copyright 2019 Google LLC
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * Updates specific to the Sangoma Asterisk External Media Sample:
 * Copyright (C) 2019, Sangoma Technologies Corporation
 * George Joseph <gjoseph@digium.com>
 * 
 * Also licensed under the Apache 2.0 license.
 *
 */

/**
 * This application demonstrates how to perform infinite streaming using the
 * streamingRecognize operation with the Google Cloud Speech API.
 * Before the streaming time limit is met, the program uses the
 * 'result end time' parameter to calculate the last 'isFinal' transcription.
 * When the time limit is met, the unfinalized audio from the previous session
 * is resent all at once to the API, before continuing the real-time stream
 * and resetting the clock, so the process can repeat.
 * Incoming audio should not be dropped / lost during reset, and context from
 * previous sessions should be maintained as long the utterance returns an
 * isFinal response before 2 * streamingLimit has expired.
 * The output text is color-coded:
 *    red - unfinalized transcript
 *    green - finalized transcript
 *    yellow/orange - API request restarted
 */

/**
 * Most of this code is directly from the Google Speech API
 * example for continuous streaming of audio.  It was originally
 * written to take input directly from the computer microphone but
 * it's been adapted to read from a socket instead.
 * 
 * See https://github.com/googleapis/nodejs-speech/blob/master/samples/infiniteStreaming.js
 * for the original source.
 * 
 * As the transcription is received, printed on the console and
 * passed back to the caller via transcriptCallback, which provides
 * just the transcribed text, and resultsCallback whic provides the
 * full results structure. 
 */

const chalk = require('chalk');
const {Transform} = require('stream');
const speech = require('@google-cloud/speech').v1p1beta1;

class GoogleSpeechProvider {
	constructor(config, socket, transcriptCallback, resultsCallback) {
		this.speechClient = new speech.SpeechClient();
		this.request = {
		    config,
		    interimResults: true,
		};
		this.recognizeStream = null;
		this.restartCounter = 0;
		this.audioInput = [];
		this.lastAudioInput = [];
		this.resultEndTime = 0;
		this.isFinalEndTime = 0;
		this.finalRequestEndTime = 0;
		this.newStream = true;
		this.bridgingOffset = 0;
		this.lastTranscriptWasFinal = false;
		this.streamingLimit = 25000;

		this.audioInputStreamTransform = new Transform({
			transform: (chunk, encoding, callback) => {
				this.transformer(chunk, encoding, callback);
			}
		});
		
		this.transcriptCallback = transcriptCallback;
		this.resultsCallback = resultsCallback;
		this.startStream();
		this.socket = socket;
		// This connects the socket to the Stream Transform
		socket.pipe(this.audioInputStreamTransform);
	}
	
	startStream() {
		// Clear current audioInput
		this.audioInput = [];
		
		// This callback sends the transcript back to the ari-transcriber
		this.cb = (stream) => {
			let results = this.speechCallback(stream);
            if (this.transcriptCallback && results[0] && results[0].alternatives[0]) {
				this.transcriptCallback(results[0].alternatives[0].transcript,
					results[0].isFinal);
			}
			if (this.resultsCallback) {
				this.resultsCallback(results);
			}
		};
		
		// Initiate (Reinitiate) a recognize stream
		this.recognizeStream = this.speechClient
			.streamingRecognize(this.request)
			.on('error', err => {
				if (err.code === 11) {
					// this.restartStream();
				} else {
					console.error('API request error ' + err);
				}
			})
			.on('data', this.cb);
				
		// Restart stream when streamingLimit expires
		setTimeout(() => {
			this.restartStream();
		}, this.streamingLimit);
	}
	
	speechCallback(stream) {
		this.resultEndTime =
			stream.results[0].resultEndTime.seconds * 1000 +
			Math.round(stream.results[0].resultEndTime.nanos / 1000000);

		// Calculate correct time based on offset from audio sent twice
		const correctedTime =
			this.resultEndTime - this.bridgingOffset + this.streamingLimit * this.restartCounter;

		process.stdout.clearLine();
		process.stdout.cursorTo(0);

		let stdoutText = '';
		if (stream.results[0] && stream.results[0].alternatives[0]) {
			stdoutText = stream.results[0].alternatives[0].transcript;
		}

		if (stream.results[0].isFinal) {
			this.isFinalEndTime = this.resultEndTime;
			process.stdout.write(chalk.green(`${stdoutText}\n`));
			this.lastTranscriptWasFinal = true;
		} else {
			// Make sure transcript does not exceed console character length
			if (stdoutText.length > process.stdout.columns) {
				stdoutText = stdoutText.substring(0, process.stdout.columns - 4) + '...';
			}
			process.stdout.write(chalk.red(`${stdoutText}`));
			this.lastTranscriptWasFinal = false;
		}
		return stream.results;
	}

	/*
	 * The transformer accumulates and keeps track
	 * of the audio chunks to make sure we don't lose anything
	 * when we restart the stream.
	 */ 
	transformer (chunk, encoding, callback) {
		if (this.newStream && this.lastAudioInput.length !== 0) {
			// Approximate math to calculate time of chunks
			const chunkTime = this.streamingLimit / this.lastAudioInput.length;
			if (chunkTime !== 0) {
				if (this.bridgingOffset < 0) {
					this.bridgingOffset = 0;
				}
				if (this.bridgingOffset > this.finalRequestEndTime) {
					this.bridgingOffset = this.finalRequestEndTime;
				}
				const chunksFromMS = Math.floor(
						(this.finalRequestEndTime - this.bridgingOffset) / chunkTime
				);
				this.bridgingOffset = Math.floor(
						(this.lastAudioInput.length - chunksFromMS) * chunkTime
				);
				for (let i = chunksFromMS; i < this.lastAudioInput.length; i++) {
					this.recognizeStream.write(this.lastAudioInput[i]);
				}
			}
			this.newStream = false;
		}
		this.audioInput.push(chunk);

		if (this.recognizeStream) {
			this.recognizeStream.write(chunk);
		}

		callback();
	}

	restartStream() {
		if (this.recognizeStream) {
			this.recognizeStream.removeListener('data', this.cb);
			this.recognizeStream = null;
		}

		if (this.resultEndTime > 0) {
			this.finalRequestEndTime = this.isFinalEndTime;
		}
		this.resultEndTime = 0;
		this.lastAudioInput = [];
		this.lastAudioInput = this.audioInput;

		this.restartCounter++;

		if (!this.lastTranscriptWasFinal) {
			process.stdout.write("\n");
		}
		process.stdout.write(
				chalk.yellow(`${this.streamingLimit * this.restartCounter}: RESTARTING REQUEST\n`)
		);

		this.newStream = true;

		this.startStream();
	}
}

module.exports.GoogleSpeechProvider = GoogleSpeechProvider; 
