//! Reminders as the system's own notifications, which arrive whether or not the app is open.

use std::cell::RefCell;
use std::sync::mpsc;

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_foundation::{NSBundle, NSDateComponents, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNCalendarNotificationTrigger, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse, UNNotificationSound,
    UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use serde::Deserialize;
use tauri::AppHandle;

use crate::links;

#[derive(Deserialize)]
pub struct Reminder {
    id: String,
    title: String,
    body: String,
    /// The app path it opens.
    path: String,
    at: At,
}

/// A time by the clock on the wall, wherever the Mac then is.
#[derive(Deserialize)]
struct At {
    year: isize,
    month: isize,
    day: isize,
    hour: isize,
    minute: isize,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and Opener does not implement Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = AppHandle]
    struct Opener;

    unsafe impl NSObjectProtocol for Opener {}

    unsafe impl UNUserNotificationCenterDelegate for Opener {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _: &UNUserNotificationCenter,
            _: &UNNotification,
            done: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            done.call((UNNotificationPresentationOptions::Banner | UNNotificationPresentationOptions::List,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn chosen(&self, _: &UNUserNotificationCenter, response: &UNNotificationResponse, done: &DynBlock<dyn Fn()>) {
            if let Some(path) = response.notification().request().content().targetContentIdentifier() {
                links::open_path(self.ivars(), &path.to_string());
            }
            done.call(());
        }
    }
);

impl Opener {
    fn new(app: AppHandle, main: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(main).set_ivars(app);
        unsafe { msg_send![super(this), init] }
    }
}

thread_local! {
    // The notification centre doesn't keep its delegate.
    static OPENER: RefCell<Option<Retained<Opener>>> = const { RefCell::new(None) };
}

/// None outside an app bundle, where asking for the centre would end the process.
fn center() -> Option<Retained<UNUserNotificationCenter>> {
    NSBundle::mainBundle().bundleIdentifier().map(|_| UNUserNotificationCenter::currentNotificationCenter())
}

/// Before the app has finished launching, so a notification that launched it is heard.
pub fn install(app: &AppHandle) {
    let (Some(center), Some(main)) = (center(), MainThreadMarker::new()) else { return };
    let opener = Opener::new(app.clone(), main);
    center.setDelegate(Some(ProtocolObject::from_ref(&*opener)));
    OPENER.with(|kept| *kept.borrow_mut() = Some(opener));
}

/// Ask for permission; macOS shows its question only the first time.
#[tauri::command(async)]
pub fn allow_reminders() -> bool {
    let Some(center) = center() else { return false };
    let (sender, receiver) = mpsc::channel();
    let answered = RcBlock::new(move |granted: Bool, _: *mut NSError| {
        let _ = sender.send(granted.as_bool());
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &answered,
    );
    receiver.recv().unwrap_or(false)
}

/// Replace every reminder still to come.
#[tauri::command(async)]
pub fn set_reminders(reminders: Vec<Reminder>) {
    let Some(center) = center() else { return };
    center.removeAllPendingNotificationRequests();
    for reminder in reminders {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(&reminder.title));
        content.setBody(&NSString::from_str(&reminder.body));
        content.setTargetContentIdentifier(Some(&NSString::from_str(&reminder.path)));
        content.setSound(Some(&UNNotificationSound::defaultSound()));
        let at = NSDateComponents::new();
        at.setYear(reminder.at.year);
        at.setMonth(reminder.at.month);
        at.setDay(reminder.at.day);
        at.setHour(reminder.at.hour);
        at.setMinute(reminder.at.minute);
        let trigger = UNCalendarNotificationTrigger::triggerWithDateMatchingComponents_repeats(&at, false);
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(&reminder.id),
            &content,
            Some(&trigger),
        );
        center.addNotificationRequest_withCompletionHandler(&request, None);
    }
}
