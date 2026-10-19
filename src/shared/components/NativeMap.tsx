import MapView, { Marker, Polyline } from 'react-native-maps';
import { View } from 'react-native';
import type { Coordinate } from '@/features/operations/model';
import { colors } from '@/shared/theme';
import { Label } from './primitives';
export function NativeMap({
  coordinate,
  route,
  height,
}: {
  coordinate?: Coordinate;
  route: Coordinate[];
  height: number;
}) {
  if (!coordinate)
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Label muted size={12}>
          Localização do destino indisponível
        </Label>
      </View>
    );
  return (
    <MapView
      style={{ height, borderRadius: 16 }}
      initialRegion={{ ...coordinate, latitudeDelta: 0.045, longitudeDelta: 0.045 }}
      showsUserLocation={false}
    >
      <Marker coordinate={coordinate} />
      {route.length > 1 && (
        <Polyline coordinates={route} strokeColor={colors.blue} strokeWidth={4} />
      )}
    </MapView>
  );
}
