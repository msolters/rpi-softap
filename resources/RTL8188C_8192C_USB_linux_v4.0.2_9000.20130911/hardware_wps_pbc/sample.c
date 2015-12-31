
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <sys/types.h>
//#include <sys/stropts.h>
//#include <math.h>
#include <fcntl.h>
#include <ctype.h>
#include <netdb.h>              /* gethostbyname, getnetbyname */
#include <unistd.h>
#include <sys/socket.h>         /* for "struct sockaddr" et al  */
#include <sys/time.h>           /* struct timeval */
#include <sys/signal.h>
#include <linux/version.h>
//#if LINUX_VERSION_CODE < KERNEL_VERSION(2,6,27)
//#include <net/if.h>
//#endif
#include <net/ethernet.h>       /* struct ether_addr */
#include <linux/if_packet.h>
#include <linux/if_ether.h>
#include <linux/if_arp.h>
#include <linux/wireless.h>


//#include "iwlib.h"

static void HWPBC_SignalHandler(int sig)
{
	//if(sig==0x0a)
	{
		printf("get HW_PBC signal from driver\n");

		//todo: execute the command below to start WPS PBC Method
		
		//"./wpa_cli -p/var/run/wpa_supplicant wps_pbc any"
		
		//pop UI/dialog to show starting WPS PBC - timeout = 120sec
		
	}	
 
}


/*------------------------------------------------------------------*/
/*
 * Wrapper to push some Wireless Parameter in the driver
 */
static inline int
iw_set_ext(int	skfd,		/* Socket to the kernel */
	   const char *		ifname,		/* Device name */
	   int request_id,	/* WE ID */
	   struct iwreq *	pwrq)		/* Fixed part of the request */
{
	/* Set device name */
 	strncpy(pwrq->ifr_name, ifname, IFNAMSIZ);
	//strncpy(pwrq->ifr_ifrn.ifr_name, ifname, IFNAMSIZ);
	
	
  	/* Do the request */
  	return(ioctl(skfd, request_id, pwrq));
	
}

int main(int argc, char** argv)
{
	int pid;
	struct iwreq wrq;
	int devsock;	
	char ifrn_name[IFNAMSIZ];	/* if name, e.g. "wlan0" */
	int cmd =  SIOCIWFIRSTPRIV + 0x05;
	int req[2];
	
	printf("for example\n");

/*
	if ((argc != 2) || (argv[1][0] == '-')) {
		printf("Usage: macaddr interface\n");
		exit(1);
	}
*/
	strncpy(ifrn_name, "wlan0", IFNAMSIZ);

	devsock = socket(AF_INET, SOCK_STREAM, 0);
	//devsock = socket(AF_INET, SOCK_DGRAM, 0);
	if (devsock == -1) {
		//perror("Failed opening socket");
		printf("failed opening socket\n");
		exit(1);
	}


	/*(1) set signal handler. */
 	signal(SIGUSR1, HWPBC_SignalHandler);

	
	/*(2) Tell wifi driver our pid, so that it can send a signal to us. */
	pid = getpid();
	
	printf("my pid is %d\n", pid);

	req[0]=0; req[1]=pid;

	memcpy(wrq.u.name, req, sizeof(int)*2);

 	if(iw_set_ext(devsock, ifrn_name, cmd, &wrq) < 0)
 	 {
		printf("failed iw_set_ext!\n");
 	 	close(devsock);	
		exit(1);
 	 }	 
	
	
	while(1)
	{
		printf("$> ");

		while( getchar() != '\n')
		{

		}

	}	
		
	close(devsock);	

	exit(0);
	
}

