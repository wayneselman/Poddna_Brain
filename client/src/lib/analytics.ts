export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (window.gtag) {
    window.gtag("event", eventName, params);
  }
}
