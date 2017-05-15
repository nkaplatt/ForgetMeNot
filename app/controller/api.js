
var request = require('request');
var properties = require('../config/properties.js');
var googleMapsClient = require('../api_clients/googleMapsClient.js');
var Wit = require('node-wit').Wit;
//var interactive = require('node-wit').interactive;

// models for users and the memories/reminders they submit
var user = require('../model/user');
var remember = require('../model/messages');

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
    setLocationWit({context, entities}) {
      console.log(`Wit extracted ${JSON.stringify(entities)}`);
      setLocation();
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
          case "/subscribe":
            subscribeUser(sender)
            break;
          case "/unsubscribe":
            sendTextMessage(sender, "unsubscribe")
            break;
          case "/subscribestatus":
            sendTextMessage(sender, "subscribestatus")
            break;
          case "whats my id":
            sendTextMessage(sender, "your id is "+sender)
            break;
          case "set timezone":
            setLocation(sender)
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

function receivedMessage(event) {
  // Putting a stub for now, we'll expand it in the following steps
  console.log("Message data: ", event.message);
}

function sendGenericMessage(recipientId, messageText) {
  // To be expanded in later sections
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

// fetch wits response
function witResponse(recipientId, message) {
  witClient.runActions(recipientId, message, {})
  .then((data) => {
    console.log(JSON.stringify(data));
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

/* Save a user to the database */
function subscribeUser(id) {
  var newUser = new user({
    fb_id: id,
  });
  user.findOneAndUpdate({fb_id: newUser.fb_id}, {fb_id: newUser.fb_id}, {upsert:true}, function(err, user) {
    if (err) {
      sendTextMessage(id, "There was error subscribing you for daily articles");
    } else {
      console.log('User saved successfully!');
      sendTextMessage(newUser.fb_id, "You've been subscribed!")
    }
  });
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
