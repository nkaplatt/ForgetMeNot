
var request = require('request');
var properties = require('../config/properties.js');
var googleMapsClient = require('../api_clients/googleMapsClient.js');
var Wit = require('node-wit').Wit;
//var interactive = require('node-wit').interactive;

// models for users and the memories/reminders they submit
var user = require('../model/user');
var timeMemory = require('../model/timeBasedMemory');

// user information global variable
var first_name = "";
var id = "";

// Wit AI
var witClient = new Wit({
  accessToken: properties.wit_ai_server_access,
  actions: {
    send(request, response) {
      return new Promise(function(resolve, reject) {
        const {sessionId, context, entities} = request;
        const {text, quickreplies} = response;
        console.log('user said...', request.text);
        console.log('sending...', JSON.stringify(response.text));
        console.log('quick response...', JSON.stringify(response.quickreplies));
        sendTextMessage(sessionId, response.text);
        return resolve();
      });
    },
    setLocationWit({sessionId, context, entities}) {
      console.log(`Wit extracted ${JSON.stringify(entities)}`);
      setLocation();
      return Promise.resolve(context);
    },
    userLocationWit({sessionId, context, text, entities}) {
      userLocation(sessionId);
      console.log(`Session ${sessionId} received ${text}`);
      console.log(`Wit extracted ${JSON.stringify(entities)}`);
      return Promise.resolve(context);
    }
  },
});

// check token for connecting to facebook webhook
exports.tokenVerification = function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === properties.facebook_challenge) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
}

/* Get user information */
exports.fbInformation = function() {

}

/* Recieve request */
exports.handleMessage = function(req, res) {
  messaging_events = req.body.entry[0].messaging;

  for (i = 0; i < messaging_events.length; i++) {
		event = req.body.entry[0].messaging[i];
		sender = event.sender.id;
    if (event.message && event.message.text) {
		  	text = event.message.text;
		  	// Handle a text message from this sender
        switch(text) {
          case "location":
            setTimeZone(sender)
            break;
          case "subscribe":
            subscribeUser(sender)
            break;
          case "unsubscribe":
            unsubscribeUser(sender)
            break;
          case "subscribestatus":
            subscribeStatus(sender)
            break;
          case "test memory":
            newTimeBasedMemory(sender)
            break;
          case "test return memory":
            returnTimeMemory(sender)
            break;
          case "set timezone":
            setLocation(sender)
            break;
          case "whats my time zone":
            userLocation(sender)
            break;
          case "test this":
            updateUserLocation(sender, "Bristol")
            break;
          default: {
            //intentConfidence(text);
            witResponse(sender, text);
          }
        }
  		}
    }
	res.sendStatus(200);
}

/* being able to send the message */
function callSendAPI(messageData) {
  request({
    uri: properties.facebook_message_endpoint,
    qs: { access_token: properties.facebook_token },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
      console.log("Successfully sent generic message with id %s to recipient %s",
      messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

function receivedMessage(event) {
  // Putting a stub for now, we'll expand it in the following steps
  console.log("Message data: ", event.message);
}

function sendGenericMessage(recipientId, messageText) {
  // Bot didnt know what to do with message from user
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "I'm sorry I didn't quite understand that, I'm still learning though!"
    }
  };
  callSendAPI(messageData);
}

/* function sends message back to user */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
  callSendAPI(messageData);
}


// ------------Wit Code Below--------------- //
// fetch wits response
function witResponse(recipientId, message) {
  witClient.runActions(recipientId, message, {})
  .then((data) => {
    //console.log(JSON.stringify(data));
  })
  .catch(console.error);
}

// check wit.ai's confidence for the intent
function intentConfidence(message) {
  witClient.message(message, {})
  .then((data) => {
    console.log(JSON.stringify(data));
    var confidence = JSON.stringify(data.entities.intent[0].confidence);
    console.log("Confidence score " + confidence);
  }).catch(console.error);
}
// -------------------------------------------- //

// ------------User Code Below---------------- //
/* Save a user to the database */
function subscribeUser(id) {
  var newUser = new user({
    fb_id: id,
    location: "placeholder"
  });
  user.findOneAndUpdate(
    {fb_id: newUser.fb_id},
    {fb_id: newUser.fb_id, location: newUser.location},
    {upsert:true}, function(err, user) {
      if (err) {
        sendTextMessage(id, "There was error subscribing you");
      } else {
        console.log('User saved successfully!');
        sendTextMessage(newUser.fb_id, "You've been subscribed!")
      }
  });
}

/* remove user from database */
function unsubscribeUser(id) {
  // built in remove method to remove user from db
  user.findOneAndRemove({fb_id: id}, function(err, user) {
    if (err) {
      sendTextMessage(id, "There was an error unsubscribing you");
    } else {
      console.log("User successfully deleted");
      sendTextMessage(id, "You've unsubscribed");
    }
  });
}

/* subscribed status */
function subscribeStatus(id) {
  user.findOne({fb_id: id}, function(err, user) {
    subscribeStatus = false;
    if (err) {
      console.log(err);
    } else {
      if (user != null) {
        subscribeStatus = true;
      }
      sendTextMessage(id, "Your status is " + subscribeStatus);
    }
  });
}

/* find the users location from the db */
function userLocation(id) {
  user.findOne({fb_id: id}, function(err, user) {
    location = "";
    if (err) {
      console.log(err);
    } else {
      if (user != null) {
        location = user.location;
        console.log(location);
        sendTextMessage(id, "We currently have your location set to " + location);
      }
    }
  });
}

function updateUserLocation(id, newLocation) {
  user.findOneAndUpdate({fb_id: id}, {location: newLocation}, function(err, user) {
    if (err) {
      console.log(err);
    } else {
      if (user != null) {
        location = user.location;
        console.log(location);
        sendTextMessage(id, "Your location has been updated to " + newLocation);
      }
    }
  });
}
// -------------------------------------------- //


// -----------User Memory Code Below--------------- //
function newTimeBasedMemory(id) {
  var newTimeMemory = new timeMemory({
    fb_id: id,
    title: "WiFi",
    value: "LetMeIn"
  });
  timeMemory.findOneAndUpdate(
    {fb_id: newTimeMemory.fb_id},
    {fb_id: newTimeMemory.fb_id, title: newTimeMemory.title, value: newTimeMemory.value},
    {upsert:true}, function(err, user) {
      if (err) {
        sendTextMessage(id, "I couldn't remember that");
      } else {
        console.log('User memory successfully!');
        sendTextMessage(newTimeMemory.fb_id, "I've now remembered that for you")
      }
  });
}

function returnTimeMemory(id) {
  timeMemory.findOne({fb_id: id}, function(err, memory) {
    if (err) {
      console.log(err);
    } else {
      if (memory != null) {
        title = memory.title;
        value = memory.value;
        console.log(title + " " + value);
        sendTextMessage(id, "Your " + title + " password is " + value);
      }
    }
  });
}
// -------------------------------------------- //


// -----------Google API Code Below--------------- //
/* query geolocation */
function setTimeZone(sender) {
  // Fetch timezone from lat & long.
  googleMapsClient.timezone({
      location: [-33.8571965, 151.2151398],
      timestamp: 1331766000,
      language: 'en'
    }, function(err, response) {
      if (!err) {
          sendTextMessage(sender, "From what you've told me I think you're based in " + response.json.timeZoneId + " am I right?");
        console.log(response);
      }
    });
}

/* set the location for a user */
function setLocation(sender) {
  var count = 0;
  // Fetch location
  googleMapsClient.geocode({
      address: 'Sydney Opera House'
  }, function(err, response) {
    if (!err) {
      var coordinates = response.json.results[0].geometry.location;
      var lat = coordinates.lat;
      var lng = coordinates.lng;
      console.log(coordinates);
      return coordinates;
      //sendTextMessage(sender, "I think I found your location " + lat + " " + lng);
      //sendTextMessage(sender, "done that for you");
    }
  });
}
// -------------------------------------------- //
