import UIKit
import UniformTypeIdentifiers

// Minimal, UI-less share extension. Saves the shared image into the shared App
// Group container as "pending-share.jpg" and best-effort foregrounds the host
// app. The host app picks up the pending image on launch/foreground (see the
// PendingShare native module) and runs it through the normal OCR pipeline, so
// correctness does NOT depend on being able to launch the app from here (iOS
// blocks that on newer versions).
class ShareViewController: UIViewController {
    private let appGroupId = "group.com.bowenjiang.CalendarOCR"

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        handleShare()
    }

    private func handleShare() {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let provider = item.attachments?.first(where: {
                  $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
              }) else {
            finish()
            return
        }

        provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] (loaded, _) in
            guard let self = self else { return }

            var image: UIImage?
            switch loaded {
            case let url as URL:     image = UIImage(contentsOfFile: url.path)
            case let img as UIImage: image = img
            case let data as Data:   image = UIImage(data: data)
            default:                 image = nil
            }

            if let jpeg = image?.jpegData(compressionQuality: 0.8),
               let container = FileManager.default.containerURL(
                   forSecurityApplicationGroupIdentifier: self.appGroupId) {
                let fileURL = container.appendingPathComponent("pending-share.jpg")
                try? jpeg.write(to: fileURL, options: .atomic)
            }

            self.finish()
        }
    }

    // Best-effort foreground the host app, then complete the request. The data
    // hand-off does NOT depend on this succeeding — the host reads the pending
    // file on its next activation regardless.
    private func finish() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let url = URL(string: "calendarocr://shared") {
                self.openHostApp(url)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        }
    }

    // Reach UIApplication via the responder chain and invoke the non-deprecated
    // open(_:options:completionHandler:). May be a no-op if iOS blocks it; that's
    // fine — the pending-file pickup covers it.
    private func openHostApp(_ url: URL) {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication, app.responds(to: selector) {
                typealias OpenURLFn = @convention(c)
                    (UIApplication, Selector, NSURL, NSDictionary, Any?) -> Void
                let imp = app.method(for: selector)
                let open = unsafeBitCast(imp, to: OpenURLFn.self)
                open(app, selector, url as NSURL, NSDictionary(), nil)
                return
            }
            responder = r.next
        }
    }
}
