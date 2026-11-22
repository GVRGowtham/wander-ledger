import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { lookupAirport } from '../../db/airportsData';
import { Flight, Trip } from '../../types/models';

interface Props {
  trips: Trip[];
  flights: Flight[];
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
}

const MAP_W = 340;
const MAP_H = 185;

/**
 * Equirectangular projection from (lat, lng) into our stylized SVG world map viewport.
 */
function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * MAP_W;
  const clampedLat = Math.max(-62, Math.min(75, lat));
  const y = ((80 - clampedLat) / 145) * MAP_H;
  return {
    x: Math.max(14, Math.min(MAP_W - 14, x)),
    y: Math.max(14, Math.min(MAP_H - 14, y)),
  };
}

const PIN_COLORS = ['#F97316', '#0EA5E9', '#8B5CF6', '#10B981', '#EC4899'];

export const WorldMapSvg: React.FC<Props> = ({
  trips,
  flights,
  selectedTripId,
  onSelectTrip,
}) => {
  const arcs = flights
    .map((f, idx) => {
      const o = lookupAirport(f.originIata);
      const d = lookupAirport(f.destIata);
      if (!o || !d) return null;
      const p1 = project(o.lat, o.lng);
      const p2 = project(d.lat, d.lng);
      const midX = (p1.x + p2.x) / 2;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midY = Math.max(10, Math.min(p1.y, p2.y) - Math.min(48, dist * 0.28));
      return {
        id: f.id,
        path: `M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`,
        color: PIN_COLORS[idx % PIN_COLORS.length],
        originPt: p1,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    path: string;
    color: string;
    originPt: { x: number; y: number };
  }>;

  return (
    <View style={styles.wrap}>
      <Svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" height={205}>
        <Defs>
          <LinearGradient id="worldOcean" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#BAE6FD" />
            <Stop offset="100%" stopColor="#E0F2FE" />
          </LinearGradient>
        </Defs>

        <Rect width={MAP_W} height={MAP_H} rx={18} fill="url(#worldOcean)" />

        {/* Stylized Cheerful Continents */}
        {/* North America */}
        <Path
          d="M24,38 Q56,24 98,42 Q112,68 92,94 Q72,106 50,90 Q24,74 24,38 Z"
          fill="#FDE68A"
          stroke="#F59E0B"
          strokeWidth={1.2}
        />
        {/* South America */}
        <Path
          d="M84,104 Q108,108 118,132 Q106,162 90,168 Q76,148 84,104 Z"
          fill="#FDE68A"
          stroke="#F59E0B"
          strokeWidth={1.2}
        />
        {/* Europe */}
        <Path
          d="M150,42 Q178,32 204,48 Q202,74 178,84 Q156,86 150,64 Z"
          fill="#BBF7D0"
          stroke="#10B981"
          strokeWidth={1.2}
        />
        {/* Africa */}
        <Path
          d="M156,90 Q188,86 208,108 Q198,148 176,156 Q158,134 156,90 Z"
          fill="#FDE68A"
          stroke="#F59E0B"
          strokeWidth={1.2}
        />
        {/* Asia */}
        <Path
          d="M204,42 Q260,26 306,52 Q314,92 282,112 Q242,124 218,98 Q204,78 204,42 Z"
          fill="#FED7AA"
          stroke="#F97316"
          strokeWidth={1.2}
        />
        {/* Australia */}
        <Path
          d="M270,132 Q298,126 314,142 Q310,162 284,160 Q266,150 270,132 Z"
          fill="#FDE68A"
          stroke="#F59E0B"
          strokeWidth={1.2}
        />

        {/* Flight Geodesic Arcs */}
        {arcs.map((a) => (
          <G key={a.id}>
            <Path
              d={a.path}
              fill="none"
              stroke={a.color}
              strokeWidth={2.2}
              strokeDasharray="5,4"
              opacity={0.9}
            />
            <Circle cx={a.originPt.x} cy={a.originPt.y} r={3} fill="#FFFFFF" stroke={a.color} strokeWidth={1.5} />
          </G>
        ))}

        {/* Tappable Destination Pins */}
        {trips.map((t, idx) => {
          const pt = project(t.lat, t.lng);
          const isSelected = t.id === selectedTripId;
          const color = PIN_COLORS[idx % PIN_COLORS.length];
          return (
            <G key={t.id} onPress={() => onSelectTrip(t.id)}>
              {isSelected && <Circle cx={pt.x} cy={pt.y} r={14} fill={color} opacity={0.25} />}
              <Circle
                cx={pt.x}
                cy={pt.y}
                r={isSelected ? 7.5 : 5.5}
                fill={color}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              {isSelected && (
                <SvgText
                  x={pt.x}
                  y={pt.y - 11}
                  fontSize={10}
                  fontWeight="bold"
                  fill="#1E293B"
                  textAnchor="middle"
                >
                  {t.destinationCity}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    backgroundColor: '#E0F2FE',
  },
});
