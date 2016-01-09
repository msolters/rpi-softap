# rpi-softap
Installation directory: `/etc/rpi-softap`

This software makes it easy to create a Raspberry Pi-based product that can be connected to any WiFi network without any keyboards or screens by establishing a browser-friendly SoftAP HTTP service.

*  If the RPi is not online (or at the touch of a GPIO-connected button) it will create its own WiFi SSID (a "SoftAP") that users can connect to from their smartphone or computer.
*  While connected to this network, the RPi will provide a simple REST server at `http://192.168.42.1` that provides end points to GET a list nearby WiFi networks, or to POST an SSID/password combo that the RPi will then remember and automatically connect to.
*  Also included is logic that will control a neopixel WS121* strip which will automatically indicate the state of the WiFi connection (i.e. not configured, working, connecting, online).

# Usage
Command | Action
---|---
sudo systemctl start rpi-softap.service | Manually start the SoftAP daemon
sudo systemctl stop rpi-softap.service | Manually stop the SoftAP daemon
sudo systemctl enable rpi-softap.service | Run rpi-softap on boot (default)
sudo systemctl disable rpi-softap.service | Do not run rpi-softap on boot

*  If there are existing WiFi credentials saved, the RPi will attempt to connect using those.
*  If the RPi connection attempt goes on infinitely, you either entered incorrect password or the WiFi network is not in range.  Press the SETUP button to enter setup mode.

# Installation
First, make sure the RPi is online already.  The installation script will need to reach the internet to get some linux packages as well as some node modules from NPM.

Then, on the RPi:

```bash
git clone https://github.com/msolters/rpi-softap
sudo cp -r rpi-softap /etc/rpi-softap
sudo /etc/rpi-softap/scripts/install
```

Note that installation can take a while as the GPIO node modules must be compiled and NodeJS is installed.

# Configuration
## Change SoftAP SSID or WiFi Channel
The particulars of the SoftAP network that the Pi will create are contained in the `hostapd` config file, located at `/etc/rpi-softap/config/hostapd.conf`.  It should look something like this:

```
interface=wlan0
driver=nl80211
ssid="My Raspberry Pi"
hw_mode=g
channel=9
macaddr_acl=0
ignore_broadcast_ssid=0
wmm_enabled=0
```

## Settings
Almost all configuration parameters are defined by the file `settings.json`.

Settings Property | Purpose
---|---
**server.port** |  The port that the RPi's HTTP setup server will listen on while in SoftAP mode.
**server.ssid** |  This string specifies the name of the AP SSID that the RPi will broadcast during setup.
**neopixels.enabled** |  A boolean; if false, you can optionally disable neopixels.
**neopixels.size** |  This is the number of pixels in the Neopixels WS281x strip connected to GPIO pin 12.
**setup_button_pin** | This is the GPIO pin that the SETUP button is connected to.  Default is pin 2.

### Actions
The `actions` setting object provides you the option of running scripts once the RPi is online, or immediately before setup.

#### `actions.whenOnline`
This script should launch your application code -- the stuff you are actually interested in running once the RPi is online!  This script is executed as soon as the RPi has acquired a valid IP address from the WiFi access point.

#### `actions.preSetup`
This script is run right after the SETUP button is pressed, and immediately before SoftAP is configured.  You can use this opportunity to e.g. kill any processes that might throw errors or crash if the network interfaces are changed and/or reconfigured (as will happen during SoftAP config).

---

# Notes on Drivers
If you are using a wireless chipset that doesn't seem to be working well with Raspbian's default nl80211 drivers, read on for more information.

A general guide to compiling `hostapd` against various drivers can be found here:  https://wireless.wiki.kernel.org/en/users/Documentation/hostapd.

This information is largely based off the following advice and tutorials.

*  [Generic Guide for RPi](http://elinux.org/RPI-Wireless-Hotspot)
*  [Realtek 8188CUS-Specific](https://www.raspberrypi.org/forums/viewtopic.php?t=25921)
*  [Realtek 8188CUS-Specific](http://www.daveconroy.com/turn-your-raspberry-pi-into-a-wifi-hotspot-with-edimax-nano-usb-ew-7811un-rtl8188cus-chipset/)

### Realtek - 8188CUS (Default Rpi dongle)
#### Get Driver
These guys require a special version of the `hostapd` driver for their chipset.  The necessary driver has already been downloaded into the `resources` folder of this repo and decompressed.

The original is available at the [Realtek website](http://www.realtek.com.tw/downloads/downloadsView.aspx?Langid=1&PNid=21&PFid=48&Level=5&Conn=4&DownTypeID=3&GetDown=false&Downloads=true) -- make sure to pick the 8188CUS chipset.

#### Install Driver
```bash
cd resources/RTL8188C_8192C_USB_linux_v4.0.2_9000.20130911/wpa_supplicant_hostapd/wpa_supplicant_hostapd-0.8_rtw_r7475.20130812/hostapd
make
sudo make install
```
