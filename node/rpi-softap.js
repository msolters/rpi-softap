#!/usr/bin/env node

var fs = require("fs");
var http = require("http");
var gpio = require("wiring-pi");
var neopixels = require('rpi-ws281x-native');

var child_process = require("child_process");
var exec = child_process.exec;
var psTree = require('ps-tree');

var events = require("events");
var eventEmitter = new events.EventEmitter();

// Define server configuration
SERVER_PORT = 80;
SERVER_HOST =  '192.168.42.1';

// Neopixel configuration
var NEO_PIXELS_NUM = 16;
/*
 *  Scales a hex color (assumed @ max brightness) to another max brightness.
 */
function scaleColorBrightness(c, brightness) {
  var r = (c >> 16) && 0xff;
  var g = (c >> 8) && 0xff;
  var b = c && 0xff;
  return ((r & brightness) << 16) + ((g & brightness) << 8) + (b & brightness);
}
/*
 *  Converts an (r, g, b) tuple into a single packed hex integer.
 */
function rgb2Int(r, g, b) {
  return ((r & 0xff) << 16) + ((g & 0xff) << 8) + (b & 0xff);
}

// Define GPIO assignments
var SETUP_pin = 2;

// Setup GPIO channels
gpio.setup('gpio');
gpio.pinMode(SETUP_pin, gpio.INPUT);
gpio.pullUpDnControl(SETUP_pin, gpio.PUD_UP);

/*
 *  Track & kill child processes
 */
current_proc = null;
kill_requested = false;
/*
 *  Kill the currently running process, if any, as well as any
 *  children it may have spawned.
 */
var killCurrentProcess = function() {
  if (!current_proc) return;
  kill_requested = true;
try {
  psTree( current_proc.pid, function(err, children) {
      child_process.spawnSync('kill', ['-2'].concat(children.map(function(p) {return p.PID})));
  });
} catch (e) {
  console.log(e);
}
  current_proc = null;
};

/*
 *  Go to the next event named by step, unless
 *  the last process was intentionally killed.
 */
var goTo = function(step) {
  current_proc = null;
  if (kill_requested) {
    kill_requested = false;
  } else {
    eventEmitter.emit(step);
  }
};

//  Regex Rules for Parsing iwlist results
var iwlist_parse = {
  new_cell: new RegExp(/.*BSS [0-9a-z]{2}:.*/),
  ssid: new RegExp(/.*SSID: (.*).*/),
  encryption: new RegExp(/.*Privacy.*/),
  signal: new RegExp(/.*signal: (-[0-9\.]+).*/)
};

/*
 *  Return a JSON list of nearby WiFi access points.
 */
var getScanResults = function() {
  /*
   * (1)  Get raw scan results.
   */
  console.log("Scanning WiFi...");
  var scanByLines = child_process.execSync("sudo iw dev wlan0 scan ap-force").toString().split("\n");
  /*
   *  (2) Initialize empty array, empty first record object
   */
  var scanResults = [];
  var scanResult = {
    ssid: null,
    security: false,
    signal: null
  };
  /*
   *  (3) Parse raw scan results line by line.
   */
  console.log("Parsing WiFi scan results...");
  for (line of scanByLines) {
    line = line.trim(); // remove any trailing white space

    if ( iwlist_parse.new_cell.test(line) ) {
      // This is a new cell, reset the current scan result object.
      scanResult = {
        ssid: null,
        security: false,
        signal: null
      };
      continue;
    }

    var ssid_parse = iwlist_parse.ssid.exec(line);
    if ( ssid_parse ) {
      scanResult.ssid = ssid_parse[1];
      // This is the last line of the current cell!
      if (scanResult.ssid.length) {
        scanResults.push( scanResult );
      }
      continue;
    }

    if ( iwlist_parse.encryption.test(line) ) {
        scanResult.security = true;
    }

    var signal_parse = iwlist_parse.signal.exec(line);
    if ( signal_parse ) {
      scanResult.signal = parseInt( signal_parse[1] );
    }
  }
  console.log(scanResults.length + " nearby SSIDs found.");
  console.log(scanResults);
  return scanResults;
};

/*
 *  Write a wpa_supplicant configuration file given a payload string
 *  containing an SSID and an optional password (WPA-PSK).
 */
var applyWiFiConfiguration  = function( payload ) {
  //  (1) Parse the payload into a JSON object.
  config = JSON.parse(payload);

  //  (2) Generate the wpa_supplicant file content.
  var wifi_config = 'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\n\nnetwork={\n\t';
  if (config.password) {
    wifi_config += 'ssid="'+config.ssid+'"\n\tpsk="'+config.password+'"\n\tkey_mgmt=WPA-PSK';
  } else {
    wifi_config += 'ssid="'+config.ssid+'"\n\tkey_mgmt=NONE';
  }
  wifi_config += '\n}\n';

  //  (3) Write the file content to disk.
  fs.writeFileSync("config/credentials.conf", wifi_config);
};

/*
 *  Create an HTTP server that listens for new WiFi credentials
 *  and also provides lists of nearby WiFi access points.
 */
server = http.createServer( function(req, res) {
  //  (1) We don't know what IP the clients may have during setup!
  res.writeHead(200, {'Access-Control-Allow-Origin': '*'});

  var attemptConnection = false
  switch (req.url) {

    case "/scan":
      console.log("WiFi Scan requested...");
      res.end( JSON.stringify( getScanResults() ) );
      break;

    case "/configure":
      var payload = '';
      req.on('data', function(data) {
        payload += data;
      });
      req.on('end', function() {
        applyWiFiConfiguration( payload );
        console.log("[SoftAP]:\tWiFi Configuration: "+payload);
        console.log("[SoftAP]:\tTerminating SETUP");
        goTo('setup_3');
      });
      //res.writeHead(200, {'Content-Type': 'text/html'});
      res.end('Configuration parameters received.');
      break;

    default:
      res.end("[SoftAP]:\tHTTP server received unrecognized command: "+req.url);
      break;
  }

});


/*
 *  Register SETUP commands.
 */
 // (1) Start SoftAP Beacon
eventEmitter.on('setup_1', function() {
  eventEmitter.emit("neo", "spin", rgb2Int(255, 180, 0), {period: 1500, tracelength: 8});
  console.log("[SoftAP]:\tInitializing access point...");
  current_proc = exec("sudo bash scripts/beacon_up", function() {
    goTo('setup_2');
  });
});

// (2) Start SoftAP Server
eventEmitter.on('setup_2', function() {
  server.listen(SERVER_PORT, SERVER_HOST);
  eventEmitter.emit("neo", "breathe", rgb2Int(0, 0, 255));
  console.log('[SoftAP]:\tServer listening at http://'+SERVER_HOST+':'+SERVER_PORT+'.');
  // Note: The server will call setup_3 when the user has completed configuration.
});

// (3) Stop the SoftAP Server
eventEmitter.on('setup_3', function() {
  eventEmitter.emit("neo", "spin", rgb2Int(255, 180, 0), {period: 2000, tracelength: 8});
  console.log("[SoftAP]:\tServer is now terminating.");
  server.close();
  goTo('setup_4');
});

// (4) Stop the SoftAP beacon
eventEmitter.on('setup_4', function() {
  console.log("[SoftAP]:\tTerminating access point...");
  current_proc = exec("sudo bash scripts/beacon_down", function() {
    goTo('connect_1'); // Time to attempt to connect!
  });
});


/*
 *  Register CONNECT commands.
 */
eventEmitter.on('connect_1', function() {
    eventEmitter.emit("neo", "spin", rgb2Int(255, 255, 0), {period: 5000, tracelength: 8});
    console.log("[SoftAP]:\tTearing down any pre-existing WiFi daemon...");
    current_proc = exec("sudo wpa_cli -i wlan0 terminate", function() {
      goTo('connect_2');
    });
});

eventEmitter.on('connect_2', function() {
    eventEmitter.emit("neo", "spin", rgb2Int(0, 255, 255), {period: 4000, tracelength: 8});
    console.log("[SoftAP]:\tInvoking WiFi daemon...");
    current_proc = exec("sudo wpa_supplicant -s -B -P /run/wpa_supplicant.wlan0.pid -i wlan0 -D nl80211,wext -c config/credentials.conf", function() {
      goTo('connect_3');
    });
});

eventEmitter.on('connect_3', function() {
    eventEmitter.emit("neo", "spin", rgb2Int(0, 255, 150), {period: 2000, tracelength: 8});
    console.log("[SoftAP]:\tFlushing IP address...");
    current_proc = exec("sudo ip addr flush dev wlan0", function() {
      goTo('connect_4');
    });
});

eventEmitter.on('connect_4', function() {
  eventEmitter.emit("neo", "spin", rgb2Int(0, 255, 150), {period: 1000, tracelength: 8});
  console.log("[SoftAP]:\tAcquiring IP address...");
  current_proc = exec("sudo dhclient wlan0", function() {
    goTo('connect_done');
  });
});

eventEmitter.on('connect_done', function() {
    console.log('[SoftAP]:\tWiFi connection complete.');
    eventEmitter.emit("neo", "breathe", rgb2Int(0, 255, 0));
});

eventEmitter.on('test_com', function() {
  eventEmitter.emit("neo", "spin", rgb2Int(0, 255, 150), {period: 1000, tracelength: 8});
  console.log('[SoftAP]:\tRunning infinite tail...');
  current_proc = exec("tail -f /var/log/6lbr.log", function() {
    console.log("test_com callback!");
  });
});

/*
 *  SETUP button interrupt.
 */
gpio.wiringPiISR(SETUP_pin, gpio.INT_EDGE_RISING, function() {
  console.log('[SoftAP]:\tSETUP button pressed.');
  eventEmitter.emit("neo", "off");
  killCurrentProcess();
  eventEmitter.emit('setup_1');
});


/*
 *    Configure Neopixels
 */
var neo_conf = {
  timer: null,
  color: 0x000000,
  num: NEO_PIXELS_NUM,
  offset: 0,
  pixelData: new Uint32Array(NEO_PIXELS_NUM),
  animation: null,
  t0: null,
  brightness: 100,
  spin: {}
};

// Initialize neopixels
neopixels.init(neo_conf.num);

var neopixelBreathe = function() {
  var dt = Date.now() - neo_conf.t0;
  neopixels.setBrightness( Math.floor( (Math.sin(dt/1000)  + 1) * (neo_conf.brightness/5.12) ) );
};

var neopixelSpin = function() {
  var current_head = neo_conf.num - 1 - neo_conf.offset;

  var delta_t = Date.now() - neo_conf.t0;
  if (delta_t > neo_conf.spin.periodPerPixel) {
    // (1)  Move everything over one pixel!
    neo_conf.offset = (neo_conf.offset + 1) % neo_conf.num;

    // (2)  Re-initialize the basic trace geometry
    var i = neo_conf.num;
    while(i--) {
      neo_conf.pixelData[i] = 0;
    }

    for (var p=0; p<neo_conf.spin.tracelength; p++) {
      var current_p = (current_head + p) % neo_conf.num;
      var current_brightness = neo_conf.brightness - (p * neo_conf.spin.brightness_delta);
      neo_conf.pixelData[current_p] = scaleColorBrightness(neo_conf.color, current_brightness);
    }
    neopixels.render(neo_conf.pixelData);
    neo_conf.t0 = Date.now();
  } /*else {
    // (1)   Compute linear fade coefficients
    var h = delta_t / neo_conf.spin.periodPerPixel;

    //  (2) Generate new pixelData vector
    var new_pixelData = new Uint32Array(neo_conf.num);
    for (var p=(neo_conf.spin.tracelength-1); p>=0; p--) {
      var current_p = (current_head + p);
      var next_p = (current_p + 1) % neo_conf.num;
      current_p = current_p % neo_conf.num;
      var current_brightness = h * neo_conf.pixelData[next_p] + (1 - h) * neo_conf.pixelData[current_p];
      new_pixelData[current_p] = scaleColorBrightness(neo_conf.color, current_brightness);
    }
    // (3)  Overwrite pixelData vector with new information
    //neo_conf.pixelData = new_pixelData;
    neopixels.render(new_pixelData);
  }*/

  //  Render the pixel data!

};

var setSpinPeriod = function(T_ms) {
  neo_conf.spin.period = T_ms;
  neo_conf.spin.periodPerPixel = T_ms/neo_conf.num;
};

var setSpinTrace = function(_tracelength) {
  neo_conf.spin.tracelength = _tracelength;
  neo_conf.spin.brightness_delta = neo_conf.brightness / _tracelength;
};

var renderColor = function() {
  for(var i = 0; i < neo_conf.num; i++) {
    neo_conf.pixelData[i] = neo_conf.color;
  }
  neopixels.render(neo_conf.pixelData);
};

/*
  *   Register Neopixel Animations
  *
  * This maps neopixel animation event message content
  * to the corresponding animation function.
  */
var neo_animations = {
  'spin': neopixelSpin,
  'breathe': neopixelBreathe
};

eventEmitter.on('neo', function(animation_type, color, options) {
  // (1)  Clear interval timer if one exists.
  if (neo_conf.timer) clearInterval( neo_conf.timer );
  if (animation_type === "off") {
    neo_conf.color = 0x000000;
    neopixels.setBrightness(0);
    renderColor();
    return;
  } else {
    neopixels.setBrightness(neo_conf.brightness);
  }

  // (2)  Update the color
  neo_conf.color = color;

  // (3)  Choose the animation
  neo_conf.animation = neo_animations[animation_type];

  // (4)  Start the animation
  var refresh_rate = 100;
  switch (animation_type) {
    case "breathe":
      renderColor();
      neo_conf.t0 = Date.now();
      break;
    case "spin":
      setSpinPeriod( options.period );
      setSpinTrace( options.tracelength );
      neo_conf.t0 = Date.now();
      refresh_rate = 30;
      break;
  }

  // (5)  Start the animation loop
  if (neo_conf.animation) {
      neo_conf.timer = setInterval(function() {
        neo_conf.animation();
      } , refresh_rate);
  }
});



/*
  *                 >>> Launch <<<
  */
fs.access("config/credentials.conf", fs.F_OK, function(err) {
  if (!err) {
    eventEmitter.emit('connect_1');
  } else {
    eventEmitter.emit('setup_1');
  }
});

/*
 *  Trap the SIGINT and do cleanup before closing.
 */
process.on('SIGINT', function () {
  console.log("[SoftAP]:\tSIGINT received.");
  killCurrentProcess();
  neopixels.reset();
  server.close();
  console.log("[SoftAP]:\tExiting Node process.");
  process.exit(0);
});
