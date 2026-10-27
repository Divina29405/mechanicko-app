import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MapWebView, type MapWebViewHandle } from '@/components/MapWebView';
import { colors } from '@/lib/theme';
import { normalizeText } from '@/lib/typography';

type Coordinates = {
  latitude: number;
  longitude: number;
};

function buildLeafletHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>
      html, body, #map { height: 100%; margin: 0; }
      body { overflow: hidden; font-family: sans-serif; }
      .distance { position: absolute; z-index: 1000; top: 8px; left: 50%; transform: translateX(-50%); padding: 6px 10px; border-radius: 14px; background: white; color: #172033; font-size: 12px; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,.18); white-space: nowrap; }
      .marker { width: 26px; height: 26px; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
      .mechanic { background: #F0A202; }
      .motorist { background: #FF4D4F; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="distance" class="distance">Waiting for live location</div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const map = L.map('map', { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const mechanicIcon = L.divIcon({ className: '', html: '<div class="marker mechanic"></div>', iconSize: [32, 32], iconAnchor: [16, 16] });
      const motoristIcon = L.divIcon({ className: '', html: '<div class="marker motorist"></div>', iconSize: [32, 32], iconAnchor: [16, 16] });
      let mechanicMarker = null;
      let motoristMarker = null;
      let routeLine = null;
      window.updateRoute = function(mechanicLat, mechanicLng, motoristLat, motoristLng, distanceLabel) {
        const motorist = [motoristLat, motoristLng];
        const hasMechanic = Number.isFinite(mechanicLat) && Number.isFinite(mechanicLng);
        if (!motoristMarker) {
          motoristMarker = L.marker(motorist, { icon: motoristIcon }).addTo(map).bindTooltip('Customer', { permanent: true, direction: 'bottom', offset: [0, 12] });
        } else {
          motoristMarker.setLatLng(motorist);
        }
        if (hasMechanic) {
          const mechanic = [mechanicLat, mechanicLng];
          if (!mechanicMarker) {
            mechanicMarker = L.marker(mechanic, { icon: mechanicIcon }).addTo(map).bindTooltip('Mechanic', { permanent: true, direction: 'bottom', offset: [0, 12] });
          } else {
            mechanicMarker.setLatLng(mechanic);
          }
          if (!routeLine) {
            routeLine = L.polyline([mechanic, motorist], { color: '#2450D8', weight: 4, dashArray: '8 7' }).addTo(map);
          } else {
            routeLine.setLatLngs([mechanic, motorist]);
          }
          document.getElementById('distance').textContent = distanceLabel + ' between mechanic and customer';
          map.fitBounds([mechanic, motorist], { padding: [35, 35], maxZoom: 15 });
        } else {
          if (mechanicMarker) map.removeLayer(mechanicMarker);
          if (routeLine) map.removeLayer(routeLine);
          mechanicMarker = null;
          routeLine = null;
          document.getElementById('distance').textContent = distanceLabel;
          map.setView(motorist, 15);
        }
      };
    </script>
  </body>
</html>`;
}

export function MiniMapPreview({
  compact = false,
  mapHeight,
  mechanicLocation,
  customerLocation,
  distanceLabel,
}: {
  compact?: boolean;
  mapHeight?: number;
  mechanicLocation?: Coordinates | null;
  customerLocation?: Coordinates | null;
  distanceLabel?: string;
}) {
  const mapRef = useRef<MapWebViewHandle | null>(null);
  const [mapHtml] = useState(buildLeafletHtml);
  const updateRoute = useCallback(() => {
    if (!customerLocation) return;
    mapRef.current?.injectJavaScript(
      `window.updateRoute(${JSON.stringify(mechanicLocation?.latitude ?? null)},${JSON.stringify(mechanicLocation?.longitude ?? null)},${customerLocation.latitude},${customerLocation.longitude},${JSON.stringify(distanceLabel ?? 'Distance unavailable')}); true;`,
    );
  }, [customerLocation, distanceLabel, mechanicLocation]);

  useEffect(() => {
    updateRoute();
  }, [updateRoute]);

  return (
    <View
      style={[styles.map, compact && styles.compactMap, mapHeight ? { height: mapHeight } : null]}
      accessibilityLabel="Preview ng ruta papunta sa customer"
    >
      {customerLocation ? (
        <MapWebView
          ref={mapRef}
          originWhitelist={["*"]}
          source={{ html: mapHtml }}
          style={styles.webMap}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          onLoadEnd={updateRoute}
        />
      ) : (
        <FallbackMap />
      )}
    </View>
  );
}

function FallbackMap() {
  return (
    <>
      <View style={[styles.road, styles.hRoad]} />
      <View style={[styles.road, styles.vRoad]} />
      <View style={[styles.road, styles.diag]} />
      <View style={[styles.pin, styles.you]}>
        <View style={styles.pinDot} />
      </View>
      <View style={[styles.pin, styles.customer]}>
        <View style={[styles.pinDot, styles.sosDot]} />
      </View>
      <View style={styles.youLabel}>
        <Text style={styles.label}>Ikaw</Text>
      </View>
      <View style={styles.custLabel}>
        <Text style={styles.label}>SOS</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    height: 148,
    borderRadius: 14,
    backgroundColor: colors.mapBg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 12,
  },
  compactMap: {
    height: 210,
    marginTop: 6,
  },
  webMap: {
    flex: 1,
  },
  road: {
    position: 'absolute',
    backgroundColor: '#2C3340',
  },
  hRoad: {
    top: 72,
    left: 0,
    right: 0,
    height: 10,
  },
  vRoad: {
    left: 118,
    top: 0,
    bottom: 0,
    width: 8,
  },
  diag: {
    width: 180,
    height: 7,
    top: 96,
    left: 40,
    transform: [{ rotate: '-18deg' }],
    backgroundColor: '#3A4252',
  },
  pin: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  you: {
    left: 108,
    top: 58,
    backgroundColor: colors.amber,
  },
  customer: {
    right: 36,
    top: 28,
    backgroundColor: colors.sos,
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg,
  },
  sosDot: {
    backgroundColor: colors.white,
  },
  youLabel: {
    position: 'absolute',
    left: 96,
    top: 84,
  },
  custLabel: {
    position: 'absolute',
    right: 32,
    top: 54,
  },
  label: {
    color: colors.text,
    fontSize: normalizeText(10),
    fontWeight: '700',
  },
});