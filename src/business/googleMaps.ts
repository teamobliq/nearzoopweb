/// <reference types="google.maps" />
/** Shared internals for every Google Maps engine in the app: the
    styled-maps JSON that keeps the NearZoop look (tan land, white roads,
    green parks, blue water, olive labels), the singleton script loader
    (callback + gm_authFailure + timeout, one script per page), and a
    minimal arbitrary-HTML overlay — Google's stock markers can't carry
    the app's chip markup without a Map ID, which would also disable the
    inline styles, so pins and the user dot are plain divs over the
    canvas instead. */

/** The design's map palette in Google's styling vocabulary. Label fill
    and stroke are always set together — Google varies them by zoom
    otherwise. */
export const NZ_GOOGLE_STYLE: google.maps.MapTypeStyle[] = [
  // Base: tan land, cream label halos, olive label ink.
  { elementType: 'geometry', stylers: [{ color: '#ecdcba' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fff8e6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7c6b4d' }] },
  // Administrative borders: olive.
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#b3a37e' }],
  },
  // Buildings (man-made structures): deeper tan, readable against the land.
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#e2cfa6' }],
  },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ecdcba' }] },
  {
    featureType: 'landscape.natural.landcover',
    elementType: 'geometry',
    stylers: [{ color: '#ecdcba' }],
  },
  // Points of interest: soft tan parcels, parks green, names and icons
  // on — the user expects the stock Google Maps behaviour (business
  // names/icons at zoom ~15+), just recolored to the design palette.
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e4d2ac' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.business', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d4eac2' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7c6b4d' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#6b5b3e' }] },
  // Roads: white fills with tan casings.
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d9c49b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a7a5b' }] },
  // Rail and transit: tan lines, no icons.
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#cdbd93' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#8a7a5b' }] },
  // Water: design blue.
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#a9d3ee' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f7fa8' }] },
]

/** Loads the Maps JavaScript API once per page — later mounts reuse the
    same script. Rejects on network failure, on auth failure (Google
    fires the gm_authFailure hook for bad keys) or after a 12s timeout. */
let loader: Promise<void> | null = null

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loader) return loader
  loader = new Promise<void>((resolve, reject) => {
    if (window.google?.maps) {
      resolve()
      return
    }
    const callbackName = '__nzGmapsLoaded'
    const globals = window as unknown as Record<string, unknown>
    const settle = (error?: Error) => {
      delete globals[callbackName]
      delete globals.gm_authFailure
      if (error) {
        loader = null
        reject(error)
      } else {
        resolve()
      }
    }
    globals[callbackName] = () => settle()
    globals.gm_authFailure = () =>
      settle(new Error('Google Maps rejected the API key'))
    const script = document.createElement('script')
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&callback=${callbackName}`
    script.async = true
    script.onerror = () => settle(new Error('Google Maps script failed to load'))
    window.setTimeout(
      () => settle(new Error('Google Maps took too long to load')),
      12000,
    )
    document.head.appendChild(script)
  })
  return loader
}

/** An arbitrary-HTML pin anchored bottom-center (the design's teardrops)
    or dead-center (the user dot). Lazily subclasses OverlayView on first
    use — the class can only exist after the API script has loaded. */
export type HtmlPin = google.maps.OverlayView & {
  setPosition: (lat: number, lng: number) => void
}

type HtmlPinOptions = {
  lat: number
  lng: number
  anchor: 'bottom' | 'center'
  /** Build the pin's DOM once; called with a detached, unstyled div. */
  build: (el: HTMLDivElement) => void
}

let OverlayClass: (new (opts: HtmlPinOptions) => google.maps.OverlayView) | null = null

export function createHtmlPin(opts: HtmlPinOptions): google.maps.OverlayView {
  if (!OverlayClass) {
    OverlayClass = class extends google.maps.OverlayView {
      private readonly div: HTMLDivElement
      private lat: number
      private lng: number
      private readonly translate: string

      constructor(o: HtmlPinOptions) {
        super()
        this.lat = o.lat
        this.lng = o.lng
        this.translate =
          o.anchor === 'bottom' ? 'translate(-50%, -100%)' : 'translate(-50%, -50%)'
        this.div = document.createElement('div')
        this.div.style.position = 'absolute'
        this.div.style.left = '0'
        this.div.style.top = '0'
        o.build(this.div)
      }

      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(this.div)
      }

      draw() {
        const projection = this.getProjection()
        if (!projection) return
        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(this.lat, this.lng),
        )
        if (!point) return
        this.div.style.left = `${point.x}px`
        this.div.style.top = `${point.y}px`
        this.div.style.transform = this.translate
      }

      onRemove() {
        this.div.remove()
      }

      setPosition(lat: number, lng: number) {
        this.lat = lat
        this.lng = lng
        this.draw()
      }
    }
  }
  return new OverlayClass(opts)
}

export function setPinPosition(
  pin: google.maps.OverlayView,
  lat: number,
  lng: number,
): void {
  ;(pin as HtmlPin).setPosition(lat, lng)
}
