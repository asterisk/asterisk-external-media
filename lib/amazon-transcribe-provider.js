/*
 * Amazon Transcribe speech engine provider
 * for Asterisk External Media Sample
 */

const chalk = require('chalk');
// Note: "node:stream" Cannot work with Node.js 10.0 to 14.17.6
const { Transform, PassThrough } = require('stream');
const {
	TranscribeStreamingClient,
	StartStreamTranscriptionCommand,
} = require('@aws-sdk/client-transcribe-streaming');

/**
 * Amazon Transcribe Provider
 *
 * @class
 */
class AmazonTranscribeProvider {

	/**
	 * @constructor
	 * @param {Object} config	Configuration for AWS API TranscribeStreamingClient()
	 * @param {RtpUdpServerSocket.server(extended from node:dgram.Stream)} socket	Raw-RTP audio data socket
	 * @param {transcriptCallback} transcriptCallback
	 * @param {resultsCallback} resultsCallback
	 */
	constructor(config, socket, transcriptCallback, resultsCallback) {

		this.config = config;
		this.socket = socket;
		this.transcriptCallback = transcriptCallback;
		this.resultsCallback = resultsCallback;

		this.audioInputPayloadStream = new PassThrough({ highWaterMark: 1 * 1024 }); // Stream chunk less than 1 KB

		this.audioInputStreamTransform = new Transform({
			readableHighWaterMark: 1 * 1024,
			transform: (chunk, encoding, callback) => {
				this.transformer(chunk, encoding, callback);
			},
		});

		this.socket.pipe(this.audioInputStreamTransform);

		// Initialize Amazon Transcribe
		this.transcribeClient = new TranscribeStreamingClient(this.config);

		this.startTranscribe();
	}

	/*
	 * Transform to another stream.
	 *
	 * @param {Buffer} chunk		Audio chunk from Asterisk
	 * @param {String} encoding		Not use here
	 * @param {Function} done_callback	Put it end of this function.
	 */
	transformer(chunk, encoding, done_callback) {
		this.audioInputPayloadStream.write(chunk);

		done_callback();
	}

	/**
	 * Asterisk audio data generator
	 */
	async* audioGenerator() {
		try {
			for await (const chunk of this.audioInputPayloadStream) {
				yield { AudioEvent: { AudioChunk: chunk } };
			}

		} catch (error) {
			console.error("Exception at Audio stream: ", error);
			throw exception;
		}
	}

	/**
	 * Start Amazon Transcribe process
	 */
	async startTranscribe() {
		const command = new StartStreamTranscriptionCommand({
			AudioStream: this.audioGenerator(),
			LanguageCode: this.config.LanguageCode,
			LanguageModelName: this.config.LanguageModelName,
			MediaEncoding: this.config.MediaEncoding,
			MediaSampleRateHertz: this.config.MediaSampleRateHertz,
			ShowSpeakerLabel: this.config.ShowSpeakerLabel,
		});

		const awsResponse = await this.transcribeClient.send(command);

		for await (const event of awsResponse.TranscriptResultStream) {
			const results = event.TranscriptEvent.Transcript.Results;

			if (this.resultsCallback) {
				this.resultsCallback(results);
			}

			if (0 < results.length && 0 < results[0].Alternatives.length) {
				const isFinal = !results[0].IsPartial;
				let stdoutText = results[0].Alternatives[0].Transcript;

				process.stdout.clearLine();
				process.stdout.cursorTo(0);

				if (isFinal) {
					process.stdout.write(chalk.green(`${stdoutText}\n`));
				} else {
					// Make sure transcript does not exceed console character length
					if (stdoutText.length > process.stdout.columns) {
						stdoutText = stdoutText.substring(0, process.stdout.columns - 4) + '...';
					}
					process.stdout.write(chalk.yellow(`${stdoutText}`));
				}
			}
		}
	}

}

module.exports.AmazonTranscribeProvider = AmazonTranscribeProvider;
