import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect, Line } from 'react-native-svg';
import { env } from '@/core/config/env';
import type { Coordinate } from '@/features/operations/model';
import { colors } from '@/shared/theme';
import { Label } from './primitives';
import { NativeMap } from './NativeMap';
export function RouteMap({
  coordinate,
  route = [],
  emergency = false,
  height = 180,
}: {
  coordinate?: Coordinate;
  route?: Coordinate[];
  emergency?: boolean;
  height?: number;
}) {
  if (!env.demo) return <NativeMap coordinate={coordinate} route={route} height={height} />;
  return (
    <View style={[styles.map, { height }]} accessibilityLabel="Ilustração da rota de demonstração">
      <Svg width="100%" height="100%" viewBox="0 0 350 200" preserveAspectRatio="xMidYMid slice">
        <Rect width="350" height="200" fill="#EDF1EE" />
        <Path d="M-20 170 Q100 30 160 130 T390 50" stroke="#D7E9ED" strokeWidth="32" fill="none" />
        {[30, 110, 210, 290].map((x) => (
          <Line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#FFFFFF" strokeWidth="14" />
        ))}
        {[45, 110, 170].map((y) => (
          <Line key={y} x1="0" y1={y} x2="350" y2={y} stroke="#FFFFFF" strokeWidth="12" />
        ))}
        <Rect x="124" y="57" width="69" height="37" rx="6" fill="#D8E5D8" />
        <Rect x="225" y="122" width="52" height="34" rx="6" fill="#DCE6DB" />
        <Path
          d="M110 168 L110 110 L290 110 L290 45"
          stroke={emergency ? '#D15B51' : colors.blue}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx="110" cy="168" r="15" fill={emergency ? '#D15B5122' : '#147D9222'} />
        <Circle cx="110" cy="168" r="7" fill={colors.navy} stroke="white" strokeWidth="3" />
        <Circle
          cx="290"
          cy="45"
          r="9"
          fill={emergency ? colors.red : colors.blue}
          stroke="white"
          strokeWidth="3"
        />
      </Svg>
      <View style={styles.caption}>
        <Label size={9} style={{ color: '#526772' }}>
          Mapa ilustrativo · demonstração
        </Label>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  map: { borderRadius: 16, overflow: 'hidden', width: '100%' },
  caption: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    backgroundColor: '#FFFFFFEB',
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
});
