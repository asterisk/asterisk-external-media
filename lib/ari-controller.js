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

/**
 * The ari controller handles the control interaction with Asterisk.
 * For simplicity's sake, this example just dials an extension rather
 * that trying to create conference bridges, etc.  For that reason,
 * we need to create a local channel and a simple mixing bridge as
 * well as the external media channel.
 */

const client = require('ari-client');
const EventEmitter = require('events');

class AriController extends EventEmitter {
	
	constructor(options) {
		super();
		this.options = Object.assign({}, options);
	}
	
	async close() {
		if (this.closing) {
			return;
		}
		this.closing = true;
		
		if (this.dogChannelId) {
			console.log("Hanging up dog channel id %s", this.dogChannelId);
			try {
				await this.ari.channels.hangup({channelId: this.dogChannelId});
			} catch(error) {
				console.error("Issue hanging up dog channel %s", error.message);
			}
			delete this.dogChannelId;
		}
		if (this.localChannel) {
			console.log("Hanging up local channel %s", this.localChannel.id);
			try {
				await this.localChannel.hangup();
			} catch(error) {
				console.error("Issue hanging up local channel %s", error.message);
			}
			delete this.localChannel;
		}
		if (this.externalChannel) {
			console.log("Hanging up external media channel %s", this.externalChannel.id);
			try {
				await this.externalChannel.hangup();
			} catch(error) {
				console.error("Issue hanging up external media channel %s", error.message);
			}
			delete this.externalChannel;
		}
		if (this.bridge) {
			console.log("Destroying bridge %s", this.bridge.name);
			try {
				await this.bridge.destroy();
			} catch(error) {
				console.error("Issue destroying bridge %s", error.message);
			}
			delete this.bridge;
		}

		if (this.options.closeCallback) {
			this.options.closeCallback();
		}
		await this.ari.stop();
		this.emit('close');
	}
	
	async connect() {
		this.ari = await client.connect(
				this.options.ariServerUrl, this.options.ariUser, this.options.ariPassword);
		
		await this.ari.start("externalMedia");
		await this.ari.start("snoopLeg");
		
		// Create a simple bridge that is controlled by ARI/Stasis
		this.bridge = this.ari.Bridge();
		try {
			await this.bridge.create({type: "mixing"});
		} catch(error) {
			console.error(error);
			this.close();
		}
		this.bridge.on('BridgeDestroyed', (event) => {
			console.log("Bridge Destroyed");
			this.close();
		});

		/*
		 *  Create the local channel.  This actually creates 2
		 *  back to back channels, one that's controlled by ARI/Stasis
		 *  that we can put into the bridge we created above and 
		 *  another one the one that dials a phone, confbridge, etc.
		 *  and joins _that_ bridge. 
		 *  
		 *  localChannel below is actually the first channel. 
		 */
		this.localChannel = this.ari.Channel();
		this.localChannel.on('StasisStart', (event, chan) => {
			this.bridge.addChannel({channel: chan.id});
		});
		this.localChannel.on('StasisEnd', (event, chan) => {
			this.close();
		});

		if (this.options.snoopTarget) {

			/*
			 * Hmm, would be nice if snoopChannel co-operated, eg.
			 *		this.dogChannel = this.ari.Channel();
			 *		await this.dogChannel.snoopChannel(...)
			 * Until then, carry around the dog channel ID instead!
			 */

			/* global callback to parse out the bridge id */
			this.ari.on('StasisStart', (event, chan) => {
				let app_data = chan.dialplan.app_data.split(",");
				if (app_data[0] == "snoopLeg") {
					if (app_data[1] == this.bridge.id) {
						this.dogChannelId = chan.id;
						this.bridge.addChannel({channel: chan.id});
						console.log("snoopLeg connected channel '%s' bridge '%s'", chan.id, this.bridge.id);
					}
				}
			});

			/* global callback to hangup when dogChannel dies */
			this.ari.on('StasisEnd', (event, chan) => {
				let app_data = chan.dialplan.app_data.split(",");
				if (app_data[0] == "snoopLeg") {
					if (app_data[1] == this.bridge.id) {
						console.log("snoopLeg disconnected channel '%s' bridge '%s'", chan.id, this.bridge.id);
						this.close();
					}
				}
			});

			/* register the bridge id started above as parameter to stasis app */
			try {
				await this.ari.channels.snoopChannel({
					app: "snoopLeg",
					appArgs: this.bridge.id,
					channelId: this.options.dialstring,
					spy: "both",
					whisper: "none"
				});
			} catch (error) {
				console.error("Could not snoop on '%s'", this.options.dialstring);
				this.close();
			}

		} else {

			// Call the phone or confbridge specified in dialstring
			try {
				await this.localChannel.originate({
					endpoint: this.options.dialstring, formats: this.options.format, app: "externalMedia",
				});
			} catch (error) {
				this.close();
			}
		}

		// Now we create the External Media channel.
		this.externalChannel = this.ari.Channel();
		this.externalChannel.on('StasisStart', (event, chan) => {
			this.bridge.addChannel({channel: chan.id});
		});
		this.externalChannel.on('StasisEnd', (event, chan) => {
			this.close();
		});

		/*
		 * We give the external channel the address of the listener
		 * we already set up and the format it should stream in.
		 */
		try {
			let resp = await this.externalChannel.externalMedia({
				app: "externalMedia",
				external_host: this.options.listenServer,
				format: this.options.format
			});
			this.emit('ready');
		} catch(error) {
			this.close();
		}
	}
}

module.exports.AriController = AriController;
