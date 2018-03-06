var server = "wss://janusgw.testcompany.com:443";
var	apisecret = "janusrocks";
// var iceServers: [{urls: "turn:turntest.testcompany.com:80?transport=tcp", username: "turnuser", credential: "turnpw"}],
var iceTransportPolicy = "relay";

var janus = null;
var videosfu = null;
var textroom = null;
var opaqueId = "videotextchat-"+Janus.randomString(12);

var started = false;

var myroom = 5678;	// TextChat Room
var myvideoroom = 5678; // VideoConf Room
var myusername = null;
var myid = null;
var mypvtid = null; // We use this other ID just to map our subscriptions to us

var mystream = null;
var feeds = [];
var bitrateTimer = [];

var participants = {}
var transactions = {}

$(document).ready(function() {

  // display the chatroom panel
  $('#chatroom').css('height', ($(window).height()-420)+"px");

  // Initialize the Janus library (all console debuggers enabled)
  Janus.init({debug: "all", callback: function() {
    console.log("xxx-Janus initialized!");
    
    // Use a button to start the demo
    $('#start').click(function() {
      console.log("xxx-Start button clicked.");
      if(started)
				return;
			started = true;
      $(this).attr('disabled', true).unbind('click');
      
      // Make sure the browser supports WebRTC
      if(!Janus.isWebrtcSupported()) {
				alert("No WebRTC support... ");
				return;
      }
      
      // Create a Janus session
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
												// $('#register').click(registerUsername);
												// $('#username').focus();
												// $('#start').removeAttr('disabled').html("Stop/Leave").click(function() {
												// 	$(this).attr('disabled', true);
												// 	janus.destroy();
												// });
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
												console.log("xxx-inTo videoRoom iceState cbFunc");
												console.log("xxx-videoRoom iceState is now: " + state);
											},
											webrtcState: function(on) {
												console.log("xxx-inTo videoRoom webrtcState cbFunc");
												Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
												// $("#videolocal").parent().parent().unblock();
											},
											mediaState: function(medium, on) {
												console.log("xxx-inTo videoRoom mediaState cbFunc");
												Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);							
											},
											onmessage: function(msg, jsep) {
												console.log("xxx-videoRoom onmessage cbFunc");
												// We got a message/event (msg) from the plugin
												// If jsep is not null, this involves a WebRTC negotiation
					
												// Janus.debug(" ::: Got a message (publisher) :::");
												// Janus.log(" ::: Got a message (publisher) :::");
												Janus.log("msg: " + JSON.stringify(msg));
												//Janus.log("jsep: " + JSON.stringify(jsep));
												var event = msg["videoroom"];
												Janus.log("Event is: " + event);
												if(event != undefined && event != null) {
													if(event === "joined") {
														console.log("xxx-videoRoom eventIs: joined");
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
														console.log("xxx-videoRoom eventIs: destroyed");
														// The room has been destroyed
														Janus.warn("The room has been destroyed!");
														alert("The room has been destroyed", function() {
															window.location.reload();
														});
													} else if(event === "event") {
														console.log("xxxx-videoRoom eventIs: event");
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
												console.log("xxx-videoRoom onlocalstream cbFunc");
												Janus.log(" ::: Got a local stream :::");
												mystream = stream;
												//Janus.log(JSON.stringify(stream));
												$('#publisher').removeClass('hide').html(myusername).show();
												// console.log(mystream);
												// videolocal.srcObject = mystream;
												// console.log("zzz-videolocal obj is: ");
												// console.log($('#videolocal'));
												$('#videolocal')[0].srcObject = mystream;
											},
											onremotestream: function(stream) {
												console.log("xxx-videoRoom onremotestream cbFunc");
												// We have a remote stream (working PeerConnection!) to display
											},
											oncleanup: function() {
												console.log("xxx-videoRoom oncleanup cbFunc");
												// PeerConnection with the plugin closed, clean the UI
												// The plugin handle is still valid so we can create a new one
												Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
											}
										});
					

					// Attach to text chatroom plugin
          janus.attach({

            plugin: "janus.plugin.textroom",
            opaqueId: opaqueId,
            success: function(pluginHandle) {
              console.log("xxx-Success: AttachedTo plugin: " + pluginHandle.getPlugin() + " with handleId: " + pluginHandle.getId());
              textroom = pluginHandle;
              Janus.log("Plugin attached! (" + textroom.getPlugin() + ", id=" + textroom.getId() + ")");
              // Setup the DataChannel
              var body = { "request": "setup" };
              Janus.log("Sending message (" + JSON.stringify(body) + ")");
              textroom.send({"message": body});
              $('#start').removeAttr('disabled').html("Stop/Leave").click(function() {
                $(this).attr('disabled', true);
								janus.destroy();
							});
            },
            error: function(error) {
              console.error("  -- Error attaching plugin...", error);
							alert("Error attaching plugin... " + error);
            },
            iceState: function(state) {
							console.log("xxx-inTo textRoom iceState cbFunc");
							console.log("xxx-textRoom iceState is now: " + state);
						},
            webrtcstate: function(on) {
              console.log("xxx-inTo textRoom webrtcState cbFunc");
              Janus.log("Janus response - WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            onmessage: function(msg, jsep) {
              console.log("xxx-textRoom onmessage cbFunc");
              //Janus.log(" ::: Got a message :::");
              //Janus.log(JSON.stringify(msg));
              Janus.log("xxx-msg: " + JSON.stringify(msg));
              if(msg["error"] !== undefined && msg["error"] !== null) {
							  alert(msg["error"]);
              }
              if(jsep !== undefined && jsep !== null) {
                // Answer
								textroom.createAnswer({
                  jsep: jsep,
                  media: { audio: false, video: false, data: true },	// only use datachannels
                  success: function(jsep) {
                    Janus.log("Got SDP!");
                    //Janus.log(jsep);
                    Janus.log("xxx-jsep: " + JSON.stringify(jsep));
										var body = { "request": "ack" };
										textroom.send({"message": body, "jsep": jsep});
                  },
                  error: function(error) {
                    Janus.error("WebRTC error:", error);
										alert("WebRTC error... " + JSON.stringify(error));
                  }
                });
              }
            },
            ondataopen: function(data) {
              console.log("xxx-textRoom ondataopen cbFunc");
              Janus.log("The DataChannel is available!");
              // Prompt for a display name to join the default room
							$('#roomjoin').removeClass('hide').show();
							$('#registernow').removeClass('hide').show();
							$('#register').click(registerUsername);
							$('#username').focus();
            },
            ondata: function(data) {
              console.log("xxx-textRoom ondata cbFunc");
              //Janus.debug("We got data from the DataChannel! " + data);
              //Janus.log("xxx-Got data from the DataChannel! " + data);
              var json = JSON.parse(data);
              var transaction = json["transaction"];
              if(transactions[transaction]) {
								// Someone was waiting for this
								transactions[transaction](json);
								delete transactions[transaction];
								return;
              }
              var what = json["textroom"];
							if(what === "message") {
                // Incoming message: public or private?
                var msg = json["text"];
								msg = msg.replace(new RegExp('<', 'g'), '&lt');
								msg = msg.replace(new RegExp('>', 'g'), '&gt');
								var from = json["from"];
								var dateString = getDateString(json["date"]);
                var whisper = json["whisper"];
                if(whisper === true) {
									// Private message
									$('#chatroom').append('<p style="color: purple;">[' + dateString + '] <b>[privateMsg from ' + participants[from] + ']</b> ' + msg);
									$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
								} else {
                  // Public message
									$('#chatroom').append('<p>[' + dateString + '] <b>' + participants[from] + ':</b> ' + msg);
									$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
                }
              } else if(what === "join") {
                // Somebody joined
								var username = json["username"];
                var display = json["display"];
                participants[username] = display ? display : username;
                if(username !== myid && $('#rp' + username).length === 0) {
                  // Add to the participants list
                  $('#list').append('<li id="rp' + username + '" class="list-group-item">' + participants[username] + '</li>');
                  $('#rp' + username).css('cursor', 'pointer').click(function() {
                    var username = $(this).attr('id').split("rp")[1];
										sendPrivateMsg(username);
                  });
                }
                $('#chatroom').append('<p style="color: green;">[' + getDateString() + '] <i>' + participants[username] + ' joined</i></p>');
								$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
              } else if(what === "leave") {
                // Somebody left
								var username = json["username"];
								var when = new Date();
								$('#rp' + username).remove();
								$('#chatroom').append('<p style="color: green;">[' + getDateString() + '] <i>' + participants[username] + ' left</i></p>');
								$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
								delete participants[username];
              } else if(what === "kicked") {
                // Somebody was kicked
								var username = json["username"];
								var when = new Date();
								$('#rp' + username).remove();
								$('#chatroom').append('<p style="color: green;">[' + getDateString() + '] <i>' + participants[username] + ' was kicked from the room</i></p>');
								$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
                delete participants[username];
                if(username === myid) {
                  bootbox.alert("You have been kicked from the room", function() {
										window.location.reload();
									});
                }
              } else if(what === "destroyed") {
                if(json["room"] !== myroom)
									return;
								// Room was destroyed!
								Janus.log("The room has been destroyed!");
								bootbox.alert("The room has been destroyed", function() {
									window.location.reload();
								});
              }
            },
            oncleanup: function() {
              console.log("xxx-textRoom oncleanup cbFunc");
              Janus.log(" ::: Got a cleanup notification :::");
							$('#datasend').attr('disabled', true);

            }
          });
        },
        error: function(error) {
          Janus.error(error);
					bootbox.alert(error, function() {
            window.location.reload();
          });
        },
        destroyed: function() {
          bootbox.alert("Janus session destroyed!")
          window.location.reload();
        }
      });
    });
  }});
});


//////////////////////////////////////


function checkEnter(field, event) {
	// console.log("xxx-inTo checkEnter Func");
	// console.log("xxx-event.keyCode=" + event.keyCode);
	// console.log("xxx-event.which=" + event.which);
	// console.log("xxx-event.charCode=" + event.charCode);
	//var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	var theCode = event.which;
	if(theCode == 13) {
		console.log("xxx-field.id is: " + field.id);
		if(field.id == 'username')
			registerUsername();
		else if(field.id == 'datasend')
			sendData();
		return false;
	} else {
		return true;
	}
}

function registerUsername() {
	console.log("xxx-inTo registerUsername Func");
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
        .html("Insert your display name (e.g., Richard)");
      $('#username').removeAttr('disabled');
			$('#register').removeAttr('disabled').click(registerUsername);
			return;
		}
		// register to videoRoom plugin
		var register = { "request": "join", "room": 5678, "ptype": "publisher", "display": username };
		myusername = username;
		videosfu.send({"message": register});
		console.log("xxx-register/join request+info sent to videoSFU" + "by " + myusername);
		// end register to videoRoom plugin

		// register to textRoom plugin
    myid = randomString(12);
		var transaction = randomString(12);
		var register = {
      textroom: "join",
			transaction: transaction,
			room: myroom,
			username: myid,
			display: username
    };
    myusername = username;
    transactions[transaction] = function(response) {
      if(response["textroom"] === "error") {
        // Something went wrong
				bootbox.alert(response["error"]);
				$('#username').removeAttr('disabled').val("");
				$('#register').removeAttr('disabled').click(registerUsername);
				return;
      }
      // We're in
			$('#roomjoin').hide();
			$('#room').removeClass('hide').show();
			$('#participant').removeClass('hide').html(myusername).show();
			$('#chatroom').css('height', ($(window).height()-420)+"px");
			$('#datasend').removeAttr('disabled');
			// Any participants already in?
      console.log("Participants:", response.participants);
      if(response.participants && response.participants.length > 0) {
        for(var i in response.participants) {
          var p = response.participants[i];
          participants[p.username] = p.display ? p.display : p.username;
          if(p.username !== myid && $('#rp' + p.username).length === 0) {
            // Add to the participants list
						$('#list').append('<li id="rp' + p.username + '" class="list-group-item">' + participants[p.username] + '</li>');
						$('#rp' + p.username).css('cursor', 'pointer').click(function() {
              var username = $(this).attr('id').split("rp")[1];
							sendPrivateMsg(username);
            });
          }
          $('#chatroom').append('<p style="color: green;">[' + getDateString() + '] <i>' + participants[p.username] + ' joined</i></p>');
					$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
        }
      }
    };
    textroom.data({
      text: JSON.stringify(register),
			error: function(reason) {
				bootbox.alert(reason);
				$('#username').removeAttr('disabled').val("");
				$('#register').removeAttr('disabled').click(registerUsername);
			}
    });
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

function sendPrivateMsg(username) {
	console.log("xxx-inTo sendPrivateMsg Func");
	var display = participants[username];
	if(!display)
		return;
	bootbox.prompt("Private message to " + display, function(result) {
		if(result && result !== "") {
			var message = {
				textroom: "message",
				transaction: randomString(12),
				room: myroom,
				to: username,
				text: result
			};
			textroom.data({
				text: JSON.stringify(message),
				error: function(reason) { bootbox.alert(reason); },
				success: function() {
					$('#chatroom').append('<p style="color: purple;">[' + getDateString() + '] <b>[privateMsg to ' + display + ']</b> ' + result);
					$('#chatroom').get(0).scrollTop = $('#chatroom').get(0).scrollHeight;
				}
			});
		}
	});
	return;
}

function sendData() {
	console.log("xxx-inTo sendData Func");
	var data = $('#datasend').val();
	if(data === "") {
		alert('Insert a message to send on the DataChannel');
		return;
	}
	var message = {
		textroom: "message",
		transaction: randomString(12),
		room: myroom,
 		text: data,
	};
	// Note: messages are always acknowledged by default. This means that you'll
	// always receive a confirmation back that the message has been received by the
	// server and forwarded to the recipients. If you do not want this to happen,
	// just add an ack:false property to the message above, and server won't send
	// you a response (meaning you just have to hope it succeeded).
	textroom.data({
		text: JSON.stringify(message),
		error: function(reason) { bootbox.alert(reason); },
		success: function() { $('#datasend').val(''); }
	});
}

// Format times
function getDateString(jsonDate) {
	var when = new Date();
	// if(jsonDate) {
	// 	when = new Date(Date.parse(jsonDate));
	// }
	var dateString =
			// ("0" + when.getUTCHours()).slice(-2) + ":" +
			// ("0" + when.getUTCMinutes()).slice(-2) + ":" +
      // ("0" + when.getUTCSeconds()).slice(-2);
      ("0" + when.getHours()).slice(-2) + ":" +
			("0" + when.getMinutes()).slice(-2) + ":" +
			("0" + when.getSeconds()).slice(-2);
  return dateString;
}

// Generate random usernames
function randomString(len, charSet) {
    charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var randomString = '';
    for (var i = 0; i < len; i++) {
    	var randomPoz = Math.floor(Math.random() * charSet.length);
    	randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}