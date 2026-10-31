import Foundation
import Capacitor
import CorePayments
import PayPalPayments
import CardPayments

/// Native PayPal checkout for the installed NEXUS app (PayPal iOS SDK 3.1.x).
///
/// The web layer creates the NEXUS order and the PayPal order on the server
/// (create-checkout-order → paypal-create-order). This plugin only collects the
/// buyer's approval; capture, amount verification and order status updates stay
/// server-side in paypal-capture-order. Nothing here marks an order as paid.
@objc(NexusPayPalPlugin)
public class NexusPayPalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NexusPayPalPlugin"
    public let jsName = "NexusPayPal"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "checkout", returnType: CAPPluginReturnPromise)]

    /// Universal links PayPal returns to after an app switch to the PayPal app.
    /// They must match apple-app-site-association on nexus.sciencebyhugs.com and the
    /// return URLs registered for this app in the PayPal developer dashboard.
    static let returnURL = URL(string: "https://nexus.sciencebyhugs.com/app/paypal/return")!
    static let cancelURL = URL(string: "https://nexus.sciencebyhugs.com/app/paypal/cancel")!
    /// Custom-scheme fallback (registered in Info.plist CFBundleURLTypes) used when the
    /// universal link is not delivered to the app.
    static let fallbackScheme = "com.sciencebyhugs.nexus.paypal"
    static let fallbackURL = URL(string: "\(fallbackScheme)://paypal")!

    /// The plugin currently awaiting a PayPal return, if any.
    private static weak var active: NexusPayPalPlugin?

    private var client: PayPalClient?
    private var pendingCall: CAPPluginCall?

    @objc func checkout(_ call: CAPPluginCall) {
        let clientID = call.getString("clientId") ?? ""
        let merchantID = call.getString("merchantId") ?? ""
        let orderID = call.getString("orderId") ?? ""
        let environmentName = (call.getString("environment") ?? "").lowercased()
        // Optional buyer hint: PayPal uses it (hashed by the SDK) for app-switch eligibility.
        let email = (call.getString("email") ?? "").trimmingCharacters(in: .whitespaces)
        let identity = Self.isPlausibleEmail(email) ? PayPalUserIdentity(email: email, phone: nil) : nil

        guard Self.isSafeToken(clientID, maxLength: 128), Self.isSafeToken(merchantID, maxLength: 64),
              Self.isSafeToken(orderID, maxLength: 64),
              environmentName == "live" || environmentName == "sandbox" else {
            call.reject("PayPal checkout is not configured for this app", "invalid_request")
            return
        }

        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("PayPal checkout is already open", "busy")
                return
            }
            let config = CoreConfig(
                clientID: clientID,
                environment: environmentName == "live" ? .live : .sandbox,
                merchantID: merchantID
            )
            let client = PayPalClient(config: config)
            self.client = client
            self.pendingCall = call
            Self.active = self

            // When the PayPal app is not installed (or app switch is not enabled for the
            // merchant) the SDK uses ASWebAuthenticationSession with its own callback scheme.
            client.createPayPalSession(
                sessionType: .checkout,
                userIdentity: identity,
                urlConfig: PayPalURLConfig(returnAppURL: Self.returnURL, cancelAppURL: Self.cancelURL, fallbackSchemeURL: Self.fallbackURL),
                userAction: .payNow
            )
            client.start(orderID: orderID) { [weak self] result in
                self?.finish(result)
            }
        }
    }

    private func finish(_ result: Result<PayPalCheckoutResult, CoreSDKError>) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        client = nil
        if Self.active === self { Self.active = nil }

        switch result {
        case .success(let approval):
            // Approval only. The server still has to capture and verify the amount.
            call.resolve(["status": "approved", "orderId": approval.orderID, "payerId": approval.payerID])
        case .failure(let error):
            if PayPalError.isCheckoutCanceled(error) {
                call.resolve(["status": "cancelled"])
            } else {
                // Never forward raw SDK errors to the page; they can include request details.
                call.reject("PayPal checkout could not be completed", "paypal_failed")
            }
        }
    }

    /// Routes a PayPal app-switch return (universal link or custom-scheme fallback) to the
    /// in-flight checkout. Returns true when the URL belonged to PayPal checkout.
    @discardableResult
    static func handleReturn(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        let isUniversalLink = scheme == "https" && url.host?.lowercased() == returnURL.host
            && url.path.lowercased().hasPrefix("/app/paypal/")
        guard isUniversalLink || scheme == fallbackScheme else { return false }
        guard let plugin = active, let client = plugin.client else { return true }
        DispatchQueue.main.async { client.handleReturnURL(url) }
        return true
    }

    private static func isPlausibleEmail(_ value: String) -> Bool {
        value.count <= 254 && value.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil
    }

    static func isSafeToken(_ value: String, maxLength: Int) -> Bool {
        !value.isEmpty && value.count <= maxLength &&
            value.unicodeScalars.allSatisfy { $0.isASCII && (CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_") }
    }
}

/// Native card checkout for the installed NEXUS app (PayPal iOS SDK CardPayments).
///
/// The card goes from this device straight to PayPal (confirm-payment-source); it is
/// never sent to NEXUS servers, logged, or stored. PayPal runs 3D Secure in an
/// ASWebAuthenticationSession when the issuer requires it. This only approves the
/// order: card-checkout-quote then shows the final total (incl. any credit-card
/// surcharge) and paypal-capture-order captures after checking the 3D Secure result.
@objc(NexusCardPlugin)
public class NexusCardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NexusCardPlugin"
    public let jsName = "NexusCard"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "approve", returnType: CAPPluginReturnPromise)]

    private var client: CardClient?
    private var pendingCall: CAPPluginCall?

    @objc func approve(_ call: CAPPluginCall) {
        let clientID = call.getString("clientId") ?? ""
        let merchantID = call.getString("merchantId") ?? ""
        let orderID = call.getString("orderId") ?? ""
        let environmentName = (call.getString("environment") ?? "").lowercased()
        let number = (call.getString("number") ?? "").filter(\.isNumber)
        let month = call.getString("expirationMonth") ?? ""
        let year = call.getString("expirationYear") ?? ""
        let securityCode = call.getString("securityCode") ?? ""
        let name = (call.getString("cardholderName") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let postalCode = (call.getString("postalCode") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        guard NexusPayPalPlugin.isSafeToken(clientID, maxLength: 128), NexusPayPalPlugin.isSafeToken(merchantID, maxLength: 64),
              NexusPayPalPlugin.isSafeToken(orderID, maxLength: 64),
              environmentName == "live" || environmentName == "sandbox" else {
            call.reject("Card payments are not configured for this app", "invalid_request")
            return
        }
        guard (12...19).contains(number.count),
              month.count == 2, (1...12).contains(Int(month) ?? 0),
              year.count == 4, Int(year) != nil,
              (3...4).contains(securityCode.count), securityCode.allSatisfy(\.isNumber),
              name.count <= 120, postalCode.count <= 12 else {
            call.reject("Check your card details and try again", "invalid_card")
            return
        }

        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Card payment is already in progress", "busy")
                return
            }
            let config = CoreConfig(
                clientID: clientID,
                environment: environmentName == "live" ? .live : .sandbox,
                merchantID: merchantID
            )
            let card = Card(
                number: number,
                expirationMonth: month,
                expirationYear: year,
                securityCode: securityCode,
                cardholderName: name.isEmpty ? nil : name,
                billingAddress: postalCode.isEmpty ? nil : Address(postalCode: postalCode, countryCode: "US")
            )
            let client = CardClient(config: config)
            self.client = client
            self.pendingCall = call
            client.approveOrder(request: CardRequest(orderID: orderID, card: card, sca: .scaWhenRequired)) { [weak self] result in
                DispatchQueue.main.async { self?.finish(result) }
            }
        }
    }

    private func finish(_ result: Result<CardResult, CoreSDKError>) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        client = nil
        switch result {
        case .success(let approval):
            // Approval only; the server checks 3D Secure and captures.
            call.resolve(["status": "approved", "orderId": approval.orderID, "threeDSecureAttempted": approval.didAttemptThreeDSecureAuthentication])
        case .failure(let error):
            if CardError.isThreeDSecureCanceled(error) {
                call.resolve(["status": "cancelled"])
            } else {
                // Never forward SDK error details; they can echo request data.
                call.reject("Your card could not be verified. Check the details or try another card.", "card_failed")
            }
        }
    }
}
