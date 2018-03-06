// 		var server = "/janus";
// 		var server = "ws://" + window.location.hostname + ":8188";

//var server = null;

//var server = [
//	"wss://janusgw.testcompany.com" + ":443",
//	"/janus"
//];

//if(window.location.protocol === 'http:')
//	server = "http://" + window.location.hostname + ":8088/janus";
//else
//	server = "https://" + window.location.hostname + ":8089/janus";

var server = "wss://janusgw.testcompany.com:443";
var apisecret = "janusrocks";
// var iceServers: [{urls: "turn:turntest.testcompany.com:80?transport=tcp", username: "turnuser", credential: "turnpw"}],
var iceTransportPolicy = "relay";

var janus = null;

var echotest = null;
var opaqueId = "echotest-"+Janus.randomString(12);

var started = false;
var bitrateTimer = null;
var spinner = null;

var audioenabled = false;
var videoenabled = false;

// Initialize the library (all console debuggers enabled)
Janus.init({
	debug: "all",
   	callback: function() {
		// Done!
	   	console.log("x-Janus initialized!");
	   	//alert("x-janus initialized!");
	   	if(!Janus.isWebrtcSupported()) {
			   alert("No WebRTC support... ");
			   return;
		}
	}
});

var janus = new Janus(
	{
		server: server,
		iceServers: [{urls: "turn:turntest.testcompany.com:80?transport=tcp", username: "turnuser", credential: "turnpw"}],
		iceTransportPolicy: iceTransportPolicy,
		apisecret: apisecret,
    success: function() {
			var gatewayAddress = janus.getServer();
			var sessionId = janus.getSessionId();
			console.log("x-success: new session - " + sessionId + " created on " + gatewayAddress);
					
			// Attach to echo test plugin, using the previously created janus instance
			janus.attach({
				
				plugin: "janus.plugin.echotest",
                
				success: function(pluginHandle) {
					// Plugin attached! 'pluginHandle' is our handle
					echotest = pluginHandle
					pluginAttached = pluginHandle.getPlugin();
					pluginHandleId = pluginHandle.getId();
					console.log("x-success: attached to plugin: " + pluginAttached + " with handleId: " + pluginHandleId);

					var body = { "audio": true, "video": true };
					echotest.send({"message": body});
					echotest.createOffer(
						{
							success: function(jsep) {
								echotest.send({"message": body, "jsep": jsep});
							},
							error: function(error) {
								console.log("x-error: " + error);
							}
						}
					);
        },
        error: function(cause) {
          // Couldn't attach to the plugin
					console.log("x-error: error attach to plugin: " + cause);
        },
        consentDialog: function(on) {
          // e.g., Darken the screen if on=true (getUserMedia incoming), restore it otherwise
        },
        onmessage: function(msg, jsep) {
          // We got a message/event (msg) from the plugin
          // If jsep is not null, this involves a WebRTC negotiation
				  if(jsep !== undefined && jsep !== null) {
					  //got ANSWER from the plugin
						echotest.handleRemoteJsep({jsep: jsep});
					}
        },
        onlocalstream: function(stream) {
          // We have a local stream (getUserMedia worked!) to display
					console.log("x-we have a localStream to display");
					video1.srcObject = stream;
        },
        onremotestream: function(stream) {
          // We have a remote stream (working PeerConnection!) to display
					console.log("x-we have a remoteStream to display")
					video2.srcObject = stream;
        },
        oncleanup: function() {
          // PeerConnection with the plugin closed, clean the UI
          // The plugin handle is still valid so we can create a new one
        },
        detached: function() {
          // Connection with the plugin closed, get rid of its features
          // The plugin handle is not valid anymore
        }
			});

		},
    error: function(cause) {
      // Error, can't go on...
		  console.log("x-error creating new janus session: " + cause);
    },
    destroyed: function() {
      // I should get rid of this
		  console.log("x-destroyed: janus session destroyed");
    }
  }
);
