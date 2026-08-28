#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Reads the kernel ARP cache — the only route to a LAN neighbour's MAC address
/// from an app sandbox, and the same interface the BSD `arp -a` command uses.
///
/// Implemented in Objective-C, not Swift, because this needs C struct layouts the
/// Darwin Swift module does not expose.
@interface ArpReader : NSObject

/// ip → "aa:bb:cc:dd:ee:ff". Empty when the kernel returns nothing, which on iOS
/// is a normal and expected outcome. Entries whose hardware address is unresolved
/// (all zero) are omitted rather than reported as "00:00:00:00:00:00".
///
/// Only reports hosts this device has recently exchanged packets with, so call it
/// after probing, never before.
+ (NSDictionary<NSString *, NSString *> *)read;

@end

NS_ASSUME_NONNULL_END
