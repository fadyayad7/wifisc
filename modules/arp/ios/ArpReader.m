#import "ArpReader.h"

#include <sys/types.h>
#include <sys/socket.h>
#include <sys/sysctl.h>
#include <net/if_dl.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <stdlib.h>

// ── Route message layout ──────────────────────────────────────────────────────
//
// <net/route.h> is not in the iOS SDK, so the two structs the ARP dump returns are
// redeclared here. They describe a kernel ABI shared with macOS, where the header
// does ship — the static assertions below pin the layout to what that SDK reports
// (sizeof(struct rt_msghdr) == 92, sizeof(struct rt_metrics) == 56 on 64-bit
// Darwin). If Apple ever changes the ABI, this fails to compile instead of
// silently misparsing the buffer.

#define ARP_RTF_LLINFO 0x400  // RTF_LLINFO from <net/route.h>

struct arp_rt_metrics {
  u_int32_t rmx_locks;
  u_int32_t rmx_mtu;
  u_int32_t rmx_hopcount;
  int32_t   rmx_expire;
  u_int32_t rmx_recvpipe;
  u_int32_t rmx_sendpipe;
  u_int32_t rmx_ssthresh;
  u_int32_t rmx_rtt;
  u_int32_t rmx_rttvar;
  u_int32_t rmx_pksent;
  u_int32_t rmx_state;
  u_int32_t rmx_filler[3];
};

struct arp_rt_msghdr {
  u_short   rtm_msglen;
  u_char    rtm_version;
  u_char    rtm_type;
  u_short   rtm_index;
  int       rtm_flags;
  int       rtm_addrs;
  pid_t     rtm_pid;
  int       rtm_seq;
  int       rtm_errno;
  int       rtm_use;
  u_int32_t rtm_inits;
  struct arp_rt_metrics rtm_rmx;
};

_Static_assert(sizeof(struct arp_rt_metrics) == 56, "rt_metrics layout changed");
_Static_assert(sizeof(struct arp_rt_msghdr) == 92, "rt_msghdr layout changed");
_Static_assert(offsetof(struct arp_rt_msghdr, rtm_flags) == 8, "rt_msghdr layout changed");
_Static_assert(offsetof(struct arp_rt_msghdr, rtm_rmx) == 36, "rt_msghdr layout changed");

// Route message sockaddrs are padded up to sizeof(uint32_t).
#define ARP_ROUNDUP(a) \
  ((a) > 0 ? (1 + (((a) - 1) | (sizeof(uint32_t) - 1))) : sizeof(uint32_t))

@implementation ArpReader

+ (NSDictionary<NSString *, NSString *> *)read
{
  // Same query `arp -a` issues: route entries carrying link-layer info.
  int mib[6] = { CTL_NET, PF_ROUTE, 0, AF_INET, NET_RT_FLAGS, ARP_RTF_LLINFO };
  size_t needed = 0;

  // First call sizes the buffer, second fills it.
  if (sysctl(mib, 6, NULL, &needed, NULL, 0) < 0 || needed == 0) {
    return @{};
  }

  char *buffer = malloc(needed);
  if (buffer == NULL) {
    return @{};
  }
  if (sysctl(mib, 6, buffer, &needed, NULL, 0) < 0) {
    free(buffer);
    return @{};
  }

  NSMutableDictionary<NSString *, NSString *> *table = [NSMutableDictionary dictionary];

  char *cursor = buffer;
  char *end = buffer + needed;
  while (cursor + sizeof(struct arp_rt_msghdr) <= end) {
    struct arp_rt_msghdr *rtm = (struct arp_rt_msghdr *)cursor;
    // A zero or overrunning length means this is not the layout we expect; stop
    // rather than walk off the end of the buffer.
    if (rtm->rtm_msglen == 0 || cursor + rtm->rtm_msglen > end) {
      break;
    }

    // Payload is the destination sockaddr_in followed by the link-layer
    // sockaddr_dl, each padded to a 4-byte boundary.
    struct sockaddr_in *destination = (struct sockaddr_in *)(rtm + 1);
    struct sockaddr_dl *link =
        (struct sockaddr_dl *)((char *)destination + ARP_ROUNDUP(destination->sin_len));

    if ((char *)(link + 1) <= end && link->sdl_alen == 6) {
      unsigned char *mac = (unsigned char *)LLADDR(link);
      // Incomplete entries are kept in the cache with an all-zero address.
      if (mac[0] || mac[1] || mac[2] || mac[3] || mac[4] || mac[5]) {
        char ip[INET_ADDRSTRLEN];
        if (inet_ntop(AF_INET, &destination->sin_addr, ip, sizeof(ip)) != NULL) {
          table[@(ip)] = [NSString stringWithFormat:@"%02x:%02x:%02x:%02x:%02x:%02x",
                                                    mac[0], mac[1], mac[2],
                                                    mac[3], mac[4], mac[5]];
        }
      }
    }

    cursor += rtm->rtm_msglen;
  }

  free(buffer);
  return table;
}

@end
