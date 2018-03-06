var server = "wss://janusgw.testcompany.com:443";
var	apisecret = "janusrocks";
// var iceServers: [{urls: "turn:turntest.testcompany.com:80?transport=tcp", username: "turnuser", credential: "turnpw"}],
var iceTransportPolicy = "relay";

var janus = null;
var videosfu = null;
var opaqueId = "videoroomtest-"+Janus.randomString(12);

var started = false;

var myusername = null;
var myid = null;
var mystream = null;
// We use this other ID just to map our subscriptions to us
var mypvtid = null;

var feeds = [];
var bitrateTimer = [];


$(document).ready(function(){
	// Initialize the library (all console debuggers enabled)
	Janus.init({debug: "all", callback: function() {
		console.log("xxx-Janus initialized!");
		
		// Use a button to start the demo
		$('#start').click(function() {
			console.log("xxx-Start button clicked.");
			// if(started)
			// 	return;
			started = true;
			$(this).attr('disabled', true).unbind('click');
			
			// Make sure the browser supports WebRTC
			if(!Janus.isWebrtcSupported()) {
				alert("No WebRTC support... ");
				return;
			}

			// Create session
			janus = new Janus({

				server: server,
				iceServers: [{urls: "turn:turntest.testcompany.com:80?transport=tcp", username: "turnuser", credential: "turnpw"}],
				iceTransportPolicy: iceTransportPolicy,
				apisecret: apisecret,
				success: function() {
					console.log("xxx-Success: newSession: " + janus.getSessionId() + " created on " + janus.getServer());
					
					// Attach to videoRoom SFU plugin
					janus.attach({
						plugin: "janus.plugin.videoroom",
						opaqueId: opaqueId,
						success: function(pluginHandle) {
							console.log("xxx-Success: Publisher attachedTo plugin: " + pluginHandle.getPlugin() + " with handleId: " + pluginHandle.getId());
							videosfu = pluginHandle;
							Janus.log("Plugin attached! (" + videosfu.getPlugin() + ", id=" + videosfu.getId() + ")");
							Janus.log("  -- This is a publisher/manager");
							// Prepare the username registration
							$('#register').click(registerUsername);
							$('#username').focus();
							$('#start').removeAttr('disabled').html("Stop/Leave").click(function() {
								$(this).attr('disabled', true);
								janus.destroy();
							});
						},
						error: function(error) {
							Janus.error("  -- Error attaching plugin...", error);
							alert("Error attaching plugin... " + error);
						},
						consentDialog: function(on) {
							Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
							if(on) {
								// Darken screen and show hint
							} else {
								// Restore screen
							}
						},
						iceState: function(state) {
							console.log("xxx-inTo iceState cbFunc");
							console.log("xxx-iceState is now: " + state);
						},
						webrtcState: function(on) {
							console.log("xxx-inTo webrtcState cbFunc");
							Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
							// $("#videolocal").parent().parent().unblock();
						},
						mediaState: function(medium, on) {
							console.log("xxx-inTo mediaState cbFunc");
							Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);							
						},
						onmessage: function(msg, jsep) {
              console.log("xxx-onmessage cbFunc");
							// We got a message/event (msg) from the plugin
              // If jsep is not null, this involves a WebRTC negotiation

							// Janus.debug(" ::: Got a message (publisher) :::");
							Janus.log(" ::: Got a message (publisher) :::");
							Janus.log("msg: " + JSON.stringify(msg));
							//Janus.log("jsep: " + JSON.stringify(jsep));
							var event = msg["videoroom"];
							Janus.log("Event is: " + event);
							if(event != undefined && event != null) {
								if(event === "joined") {
									console.log("xxx-eventIs: joined");
									// Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
									myid = msg["id"];
									mypvtid = msg["private_id"];
									Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
									publishOwnFeed(true);

									// Any new feed to attach to?
									if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
										var list = msg["publishers"];
										Janus.log("Got a list of available publishers/feeds:");
										Janus.log("publishers: "+ JSON.stringify(list));
										for(var f in list) {
											var id = list[f]["id"]; // publisherId
											var display = list[f]["display"]; // displayName
											Janus.log("  >> [" + id + "] " + display); 
											newRemoteFeed(id, display)
										}
									}
								} else if(event === "destroyed") {
									console.log("xxx-eventIs: destroyed");
									// The room has been destroyed
									Janus.warn("The room has been destroyed!");
									alert("The room has been destroyed", function() {
										window.location.reload();
									});
								} else if(event === "event") {
									console.log("xxxx-eventIs: event");
									// Any new feed to attach to?
									if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
										var list = msg["publishers"];
										Janus.log("Got a list of available publishers/feeds:");
										Janus.log("publishers: "+ JSON.stringify(list));
										for(var f in list) {
											var id = list[f]["id"]; // publisherId
											var display = list[f]["display"]; // displayName
											Janus.log("  >> [" + id + "] " + display); 
											newRemoteFeed(id, display)
										}
									} else if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
										// One of the publishers has unpublished?
										var unpublished = msg["unpublished"]; // typeOf unpublished is id
										Janus.log("Publisher left: " + unpublished);
									} else if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
										// One of the publishers has gone away?
										var leaving = msg["leaving"]; // typeOf leaving is id
										Janus.log("Publisher left: " + leaving);
										var remoteFeed = null;
											for(var i=1; i<6; i++) {
												if(feeds[i] != null && feeds[i] != undefined && feeds[i].rfid == leaving) {
													remoteFeed = feeds[i];
													break;
												}
											}
										if(remoteFeed != null) {
											Janus.log("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
											$('#remote'+remoteFeed.rfindex).empty().hide();
											$('#videoremote'+remoteFeed.rfindex).empty();
											feeds[remoteFeed.rfindex] = null;
											remoteFeed.detach();
										}
									} else if(msg["error"] !== undefined && msg["error"] !== null) {
										alert(msg["error"]);
									}
								}
							}
							if(jsep !== undefined && jsep !== null) {  
								Janus.log("Handling SDP as well...");
								//Janus.log("jsep: " + JSON.stringify(jsep));
								videosfu.handleRemoteJsep({jsep: jsep});
							}
            },
            onlocalstream: function(stream) {
              // We have a local stream (getUserMedia worked!) to display
							console.log("xxx-onlocalstream cbFunc");
							Janus.log(" ::: Got a local stream :::");
							mystream = stream;
							//Janus.log(JSON.stringify(stream));
							$('#publisher').removeClass('hide').html(myusername).show();
							// Janus.attachMediaStream($('#myvideo').get(0), stream);
							videolocal.srcObject = mystream;
            },
            onremotestream: function(stream) {
							console.log("xxx-onremotestream cbFunc");
              // We have a remote stream (working PeerConnection!) to display
            },
            oncleanup: function() {
							console.log("xxx-oncleanup cbFunc");
              // PeerConnection with the plugin closed, clean the UI
							// The plugin handle is still valid so we can create a new one
							Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
            }
					});
				},
				error: function(error) {
					Janus.error(error);
					alert(error, function() {
						window.location.reload();
					});
				},
				destroyed: function() {
					mystream = null;
					videolocal.srcObject = mystream;
					window.location.reload();
				}
			});

			$('#start').removeAttr('disabled').html("Stop").click(function() {
				console.log("xxx-Stop button clicked.");
				$(this).attr('disabled', true);
				janus.destroy();
			});			
		});
	}});	
});


/////////////////

function checkEnter(field, event) {
	var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	if(theCode == 13) {
		registerUsername();
		return false;
	} else {
		return true;
	}
}

function registerUsername() {
	if($('#username').length === 0) {
		// Create fields to register
		$('#register').click(registerUsername);
		$('#username').focus();
	} else {
		// Try a registration
		$('#username').attr('disabled', true);
		$('#register').attr('disabled', true).unbind('click');
		var username = $('#username').val();
		if(username === "") {
			$('#you')
				.removeClass().addClass('label label-warning')
				.html("Insert your display name (e.g., pippo)");
			$('#username').removeAttr('disabled');
			$('#register').removeAttr('disabled').click(registerUsername);
			return;
		}
		// if(/[^a-zA-Z0-9]/.test(username)) {
		// 	$('#you')
		// 		.removeClass().addClass('label label-warning')
		// 		.html('Input is not alphanumeric');
		// 	$('#username').removeAttr('disabled').val("");
		// 	$('#register').removeAttr('disabled').click(registerUsername);
		// 	return;
		// }
		var register = { "request": "join", "room": 5678, "ptype": "publisher", "display": username };
		myusername = username;
		videosfu.send({"message": register});
		console.log("xxx-register/join request+info sent to videoSFU");
	}
}

function publishOwnFeed(useAudio) {
	// Publish our stream
	$('#publish').attr('disabled', true).unbind('click');
	console.log("xxx-inTo publishOwnFeed func");
	videosfu.createOffer(
		{
			// Add data:true here if you want to publish datachannels as well
			media: { audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true },	// Publishers are sendonly
			success: function(jsep) {
				console.log("xxx-Success: createOffer cbFunc");
				Janus.log("Got publisher SDP!");
				//Janus.log("jsep: " + JSON.stringify(jsep));
				var publish = { "request": "configure", "audio": useAudio, "video": true };
				videosfu.send({"message": publish, "jsep": jsep});
			},
			error: function(error) {
				console.log("xxx-Failed: createOffer cbFunc");
				Janus.error("WebRTC error:", error);
				if (useAudio) {
					 publishOwnFeed(false);
				} else {
					alert("WebRTC error... " + JSON.stringify(error));
					$('#publish').removeAttr('disabled').click(function() { publishOwnFeed(true); });
				}
			}
		}
	);	
}

function newRemoteFeed(id, display) {
	console.log("xxx-inTo newRemoteFeed func");
	// A new feed has been published, create a new plugin handle and attach to it as a listener
	var remoteFeed = null;
	janus.attach(
		{
			plugin: "janus.plugin.videoroom",
			opaqueId: opaqueId,
			success: function(pluginHandle) {
				console.log("xxx-newRemoteFeed-Success: Subscriber attachedTo plugin: " + pluginHandle.getPlugin() + " with handleId: " + pluginHandle.getId());
				remoteFeed = pluginHandle;
				Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
				Janus.log("  -- This is a subscriber");
				// We wait for the plugin to send us an offer
				// publisher => var register = { "request": "join", "room": 5678, "ptype": "publisher", "display": username };
				var listen = { "request": "join", "room": 5678, "ptype": "listener", "feed": id, "private_id": mypvtid };
				remoteFeed.send({"message": listen});
			},
			error: function(error) {
				Janus.error("  -- Error attaching plugin...", error);
				alert("Error attaching plugin... " + error);
			},
			onmessage: function(msg, jsep) {
				console.log("xxx-newRemoteFeed onmessage cbFunc");
				Janus.log(" ::: Got a message (listener) :::");
				Janus.log("msg: " + JSON.stringify(msg));
				//Janus.log("jsep: " + JSON.stringify(jsep));
				var event = msg["videoroom"];
				Janus.log("Event is: " + event);
				if(event != undefined && event != null) {
					if(event === "attached") {
						// Subscriber created and attached
						for(var i=1;i<6;i++) {
							if(feeds[i] === undefined || feeds[i] === null) {
								feeds[i] = remoteFeed;
								remoteFeed.rfindex = i;
								break;
							}
						}
						remoteFeed.rfid = msg["id"];
						remoteFeed.rfdisplay = msg["display"];
						// if(remoteFeed.spinner === undefined || remoteFeed.spinner === null) {
						// 	var target = document.getElementById('videoremote'+remoteFeed.rfindex);
						// 	remoteFeed.spinner = new Spinner({top:100}).spin(target);
						// } else {
						// 	remoteFeed.spinner.spin();
						// }
						var target = document.getElementById('videoremote'+remoteFeed.rfindex);
						Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") in room " + msg["room"]);
						$('#remote'+remoteFeed.rfindex).removeClass('hide').html(remoteFeed.rfdisplay).show();
					} else if(msg["error"] !== undefined && msg["error"] !== null) {
						alert(msg["error"]);
					} else {
						// for debug purpose: what happened? catch something
					}
				}
				if(jsep !== undefined && jsep !== null) {
					//Janus.debug("Handling SDP as well...");
					Janus.log("xxx-newRemoteFeed func - Handling SDP as well...");
					//Janus.log("jsep: " + JSON.stringify(jsep));
					// Answer and attach
					remoteFeed.createAnswer({						
						jsep: jsep,
						media: { audioSend: false, videoSend: false },	// We want recvonly audio/video
						success: function(jsep) {
							console.log("xxx-newRemoreFeed Success: createAnswer cbFunc");
							Janus.log("Got SDP!");
							//Janus.log("jsep: " + JSON.stringify(jsep));
							var body = { "request": "start", "room": 5678 };
							remoteFeed.send({"message": body, "jsep": jsep});
						},
						error: function(error) {
							Janus.error("WebRTC error:", error);
							alert("WebRTC error... " + JSON.stringify(error));
						}
					}); 						
				}
			},
			iceState: function(state) {
				console.log("xxx-newRemoteFeed inTo iceState cbFunc");
				console.log("xxx-newRemoteFeed iceState is now: " + state);
			},
			webrtcState: function(on) {
				console.log("xxx-newRemoteFeed inTo webrtcState cbFunc");
				Janus.log("xxx-newRemoteFeed Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
			},
			mediaState: function(medium, on) {
				console.log("xxx-newRemoteFeed inTo mediaState cbFunc");
				Janus.log("xxx-newRemoteFeed Janus " + (on ? "started" : "stopped") + " receiving our " + medium);							
			},
			onlocalstream: function(stream) {
				// The subscriber stream is recvonly, we don't expect anything here
			},
			onremotestream: function(stream) {
				console.log("xxx-newRemoteFeed onremotestream cbFunc");
				console.log("xxx-We have a stream come from remoteFeed!");
				//Janus.debug("Remote feed #" + remoteFeed.rfindex);
				Janus.log("Remote feed #" + remoteFeed.rfindex);
				mystream = stream;
				$('#remote'+remoteFeed.rfindex).removeClass('hide').html(remoteFeed.rfdisplay).show();
				//videoremote1.srcObject = mystream;
				//console.log($('#videoremote'+remoteFeed.rfindex));
				$('#videoremote'+remoteFeed.rfindex)[0].srcObject = mystream;
			},
			oncleanup: function() {
				console.log("xxx-newRemoteFeed oncleanup cbFunc");
				Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
				//videoremote1.srcObject = null;
				$('#videoremote'+remoteFeed.rfindex)[0].srcObject = null;
			}
		}
	);
}