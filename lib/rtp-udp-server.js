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
 * This is a simple UDP listener that...
 * 	* Receives raw RTP packets
 *  * Strips off the the 12 byte RTP header
 *  * Swaps the byte ordering if the audio is SLIN
 *    (RTP SLIN is big-endian but most providers expect little-endian)
 *  * Writes the audio to a debug file path is provided.
 *  * Emits the 'data' event.
 *
 *  Datagram sockets don't normally implement streaming capabilities
 *  like piping but piping would be very handy to use with a speech
 *  provider.  Fortunately it's easy to just add the Stream 'pipe'
 *  method to the socket.  It listens for 'data' events and just writes
 *  the data out to the stream provided in the 'pipe' call.  The ari-transcriber
 *  passes the socket to the speech provider who makes that pipe call.
 */

const fs = require('fs');
const dgram = require('dgram');
const pipe = require('stream').prototype.pipe;

class RtpUdpServerSocket {
	constructor(host, swap16, alsoWritePath) {
		this.server = dgram.createSocket('udp4');
		// Add the Stream.pipe() method to the socket
		this.server.pipe = pipe;

		this.swap16 = swap16 || false;
		this.alsoWritePath = alsoWritePath;
		this.address = host.split(':')[0];
		this.port = host.split(':')[1];

		if (this.alsoWritePath) {
			this.fileStream = fs.createWriteStream(this.alsoWritePath, {
				autoClose: true
			});
		}

		this.server.on('error', (err) => {
			console.log(`server error:\n${err.stack}`);
			this.server.close();
			if (this.fileStream) {
				this.fileStream.close();
			}
		});

		this.server.on('close', (err) => {
			console.log(`server socket closed`);
			if (this.fileStream) {
				this.fileStream.close();
			}
		});

		this.server.on('message', (msg, rinfo) => {
			/* Strip the 12 byte RTP header */
			let buf = msg.slice(12);
			if (this.swap16) {
				buf.swap16();
			}
			if (this.fileStream) {
				this.fileStream.write(buf);
			}
			this.server.emit('data', buf);
		});

		this.server.on('listening', () => {
			const address = this.server.address();
			console.log(`server listening ${address.address}:${address.port}`);
		});

		this.server.bind(this.port, this.address);
		return this.server;
	}
}

module.exports.RtpUdpServerSocket = RtpUdpServerSocket;
