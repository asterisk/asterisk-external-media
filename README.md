

# Asterisk External Media Sample

This package demonstrates how to use the ARI External Media feature to transcribe
the audio from a bridge using the Google Speech APIs. 

## Installation

#### Prerequisites
* A functional Asterisk 16.6.0+ installation.
* A conference bridge or phone configured.
* Node.JS version 10 or greater.
* Google Speech API credentials set in environment variable GOOGLE_APPLICATION_CREDENTIALS.  
See https://cloud.google.com/speech-to-text/docs/ for more information.

Run `npm install` from the top of the source tree.
This will install the required npm packages including `node-ari-client` and `@google-cloud/speech`.
You can then run the transcriber as `bin/ari-transcriber`.  If you add the `-g`
option to `npm install` to install system wide, you can just run `ari-transcriber`. 

## Usage

```
$ ari-transcriber --help
ari-transcriber [options] <dialstring>

Start the transcription server

Positionals:
  dialstring  Extension to dial such as "Local/1234"

Incoming Audio Server
  --format, -f        Asterisk format/codec                                         [string] [choices: "ulaw", "slin16"] [default: "ulaw"]
  --listenServer, -l  Address and port on which to listen for audio from Asterisk                     [string] [default: "127.0.0.1:9999"]

Speech
  --speechModel         Google Speech API model                  [string] [choices: "phone_call", "video", "default"] [default: "default"]
  --speechLang          BCP-47 Language code.  en-US, fr-CA, etc.                  [string] [choices: "en-US", "fr-CA"] [default: "en-US"]
  --speakerDiarization  Outputs words associated to speaker index to the console.                               [boolean] [default: false]

ARI
  --ariServerUrl, -a  The URL for the Asterisk instance                                        [string] [default: "http://127.0.0.1:8088"]
  --ariUser, -u       The user configured in ari.conf                                                       [string] [default: "asterisk"]
  --ariPassword, -p   The password for the user configured in ari.conf                                      [string] [default: "asterisk"]

Transcription WebSocket
  --sslCert  WebSocket secure server (wss) certificate. If omitted, a non-secures (ws) websocket server will be created           [string]
  --sslKey   WebSocket secure server key. Must be supplied if sslCert is ssplied                                                  [string]
  --wssPort  WebSocket server port.  If omitted, no websocket server will be started                                              [number]

Options:
  --version          Show version number                                                                                         [boolean]
  --help             Show help                                                                                                   [boolean]
  --audioOutput, -o  A file into which the raw audio from Asterisk can be written                                                 [string]

Examples:
  ari-transcriber --format=slin16 --sslCert=/etc/letsencrypt/live/myserver/fullchain.pem
  --sslKey=/etc/letsencrypt/live/myserver/privkey.pem --wssPort=39990 --speakerDiarization 'Local/1234'
```

The ari-transcriber performs several tasks:
* Creates an ari-client instance
* Creates a WebSocket server from which the live transcription can be accessed
* Starts an audio server to receive the audio from Asterisk
* Creates an instance of Google Speech Provider that takes the audio from the server, transcribes it, and sends the transcription out the websocket
* Uses the ARI instance to:
  * Create a mixing bridge
  * Create a Local channel which dials the conference bridge to be monitored
  * Place the local channel into the mixing bridge
  * Create an External Media channel that directs the audio to the audio server
  * Place the External Media channel into the mixing bridge

Why the Local channel and bridge?  To keep the sample as simple as possible,
it's assumes that a conference bridge is already available.  Since that
bridge wouldn't be controlled by ARI/Stasis, we can't just add the External
Media channel directly to it.  Instead we have to create a Local channel that _dials_
the conference bridge, then bridge _that_ channel with the External Media
channel.  If you were ading External Media capabilities to your own application,
chances are that your app would already control the participant bridge and you
wouldn't need the Local channel and mixing bridge.

## Try It!

You don't need the WebSocket transcription server to try this.
Just a phone to call.

```
$ export GOOGLE_APPLICATION_CREDENTIALS=<path to Google API credentials>
$ ari-transcriber --format=slin16 'Local/1234'
````
