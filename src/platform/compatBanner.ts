import type { PlatformReport } from './platform'

export interface BannerMessage {
  text: string
  tone: 'info' | 'warn' | 'bad'
}

/**
 * What to tell someone who is not on the supported platform. Android is the
 * only promise (ADR-0001); iOS and browsers without service workers get told
 * plainly, once, at the top of the screen.
 */
export function compatibilityBanner(
  report: PlatformReport,
  standalone: boolean,
): BannerMessage | null {
  if (!report.installable) {
    return {
      text: 'This browser cannot store the app offline. Use Chrome on Android.',
      tone: 'bad',
    }
  }
  if (report.ios) {
    return {
      text: 'DetectorFinds is built for Android. iOS can view it, but nothing is promised.',
      tone: 'warn',
    }
  }
  if (report.desktop) {
    return {
      text: 'Desktop works for entering finds and photos. The field screens are made for a phone.',
      tone: 'info',
    }
  }
  if (!standalone) {
    return {
      text: 'Install it with the Chrome menu, then "Add to home screen", so it works with no signal.',
      tone: 'info',
    }
  }
  return null
}
