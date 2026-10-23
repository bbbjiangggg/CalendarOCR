#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

// Bridges the Share Extension hand-off to JS. The extension writes the shared
// image to the App Group container as "pending-share.jpg"; this module copies it
// into the app's own Caches (guaranteed-readable by the OCR pipeline), removes
// the original, and returns the copied path. Resolves null when nothing pending.
@interface PendingShare : NSObject <RCTBridgeModule>
@end

@implementation PendingShare

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(consume:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *container = [fm containerURLForSecurityApplicationGroupIdentifier:@"group.com.bowenjiang.CalendarOCR"];
    if (!container) { resolve([NSNull null]); return; }

    NSURL *pending = [container URLByAppendingPathComponent:@"pending-share.jpg"];
    if (![fm fileExistsAtPath:pending.path]) { resolve([NSNull null]); return; }

    NSURL *caches = [[fm URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask] firstObject];
    NSString *name = [NSString stringWithFormat:@"share-%@.jpg", [[NSUUID UUID] UUIDString]];
    NSURL *dest = [caches URLByAppendingPathComponent:name];

    [fm removeItemAtURL:dest error:nil];
    NSError *err = nil;
    [fm copyItemAtURL:pending toURL:dest error:&err];
    // Consume the pending file regardless, so it can't be processed twice.
    [fm removeItemAtURL:pending error:nil];

    if (err) { reject(@"copy_failed", err.localizedDescription, err); return; }
    resolve(dest.path);
  } @catch (NSException *e) {
    reject(@"pending_share_error", e.reason, nil);
  }
}

@end
