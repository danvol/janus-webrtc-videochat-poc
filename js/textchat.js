var server = "wss://janusgw.testcompany.com:443";
var	apisecret = "janusrocks";
// var iceServers: [{urls: "turn:turntest.testcompany.com:80?transport=tcp", username: "turnuser", credential: "turnpw"}],
var iceTransportPolicy = "relay";

var janus = null;
var textroom = null;
var opaqueId = "textchat-"+Janus.randomString(12);

var started = false;

var myroom = 5678;	// Text ChatRoom
var myusername = null;
var myid = null;
var participants = {}
var transactions = {}

$(document).ready(function() {

  // display the chatroom panel
  $('#chatroom').css('height', ($(window).height()-420)+"px");

  // Initialize the Janus library (all console debuggers enabled)
  Janus.init({debug: "all", callback: function() {
    console.log("xxx-Janus initialized!");
    //bootbox.alert("Test bootbox alert");

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

          // Attach to text room plugin
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
							console.log("xxx-inTo iceState cbFunc");
							console.log("xxx-iceState is now: " + state);
						},
            webrtcstate: function(on) {
              console.log("xxx-inTo webrtcState cbFunc");
              Janus.log("Janus response - WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            onmessage: function(msg, jsep) {
              console.log("xxx-onmessage cbFunc");
              Janus.log(" ::: Got a message :::");
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
              console.log("xxx-ondataopen cbFunc");
              Janus.log("The DataChannel is available!");
              // Prompt for a display name to join the default room
							$('#roomjoin').removeClass('hide').show();
							$('#registernow').removeClass('hide').show();
							$('#register').click(registerUsername);
							$('#username').focus();
            },
            ondata: function(data) {
              console.log("xxx-ondata cbFunc");
              //Janus.debug("We got data from the DataChannel! " + data);
              Janus.log("xxx-Got data from the DataChannel! " + data);
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
              console.log("xxx-oncleanup cbFunc");
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

///////////

function checkEnter(field, event) {
	var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	if(theCode == 13) {
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

function sendPrivateMsg(username) {
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
  console.log("xxx-Date/when = " + when);
	// if(jsonDate) {
  //   when = new Date(Date.parse(jsonDate));
  //   console.log("xxx-Date/when = " + when);
	// }
	var dateString =
			// ("0" + when.getUTCHours()).slice(-2) + ":" +
			// ("0" + when.getUTCMinutes()).slice(-2) + ":" +
      // ("0" + when.getUTCSeconds()).slice(-2);
      ("0" + when.getHours()).slice(-2) + ":" +
			("0" + when.getMinutes()).slice(-2) + ":" +
      ("0" + when.getSeconds()).slice(-2);
  console.log("xxx-dateString = " + dateString);
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