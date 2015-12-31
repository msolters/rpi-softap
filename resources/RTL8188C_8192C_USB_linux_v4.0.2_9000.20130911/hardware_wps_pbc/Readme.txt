In the WPS (WiFi Protected Setup) specification, it supports PIN and PBC.
Basically, there are two modes for WPS PBC (Pusb Button Configuration): Software PBC and hardware PBC.
About the software PBC, the wpa_supplicant and wpa_cli had supported it by using the following command,
$> wpa_cli wps_pbc

About the hardware PBC, the wpa_supplicant and wpa_cli can't detect the hardware button because this doesn't
be standardized. In order to support the hardware PBC, the customer's utility must add some codes to know
the hardware button is pressed or not.

The Realtek WiFi Linux driver is able to detect the hardware button status. First of all, the customer has 
to develop an application to capture the signal sent from Realtek WiFi driver. In this package, we had provided 
a sample code named "signal_handle_ex.c" for this application. In the main function of this sample code, it will 
pass its pid (process id) to Realtek WiFi driver so that the driver will know the target process which it wants to 
send the signal when the hardware button is pressed.

In the sample code, it registers a callback function named "HWPBC_SignalHandler" by using the signal system. When 
the hardware button is pressed and the driver had detected it, the HWPBC_SignalHandler function will be called.
In the HWPBC_SignalHandler function, it should inform the wpa_supplicant to do thw WPS procedure by using the 
software PBC command described above.

===================================================================================================================
Note: The Realtek WiFi driver will go to check the hardware button status per 2 seconds. So, we suggest the hardware 
button should be pressed for 2 seconds to make sure the driver can detect this behavior.