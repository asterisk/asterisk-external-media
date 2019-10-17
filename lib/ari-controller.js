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
		
		if (this.localChannel) {
			console.log("Hanging up local channel");
			try {
				await this.localChannel.hangup();
			} catch(error) {
			}
			delete this.localChannel;
		}
		if (this.externalChannel) {
			console.log("Hanging up external media channel");
			try {
				await this.externalChannel.hangup();
			} catch(error) {
			}
			delete this.externalChannel;
		}
		if (this.bridge) {
			console.log("Destroying bridge");
			try {
				await this.bridge.destroy();
			} catch(error) {
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
		
		// Create a simple bridge that is controlled by ARI/Stasis
		this.bridge = this.ari.Bridge();
		try {
			await this.bridge.create({type: "mixing"});
		} catch(error) {
			console.error(error);
			this.close();
		}
		this.bridge.on('BridgeDestroyed', (event) => {
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

		// Call the phone or confbridge specified in dialstring
		try {
			await this.localChannel.originate({
				endpoint: this.options.dialstring, formats: this.options.format, app: "externalMedia",
			});
		} catch (error) {
			this.close();
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