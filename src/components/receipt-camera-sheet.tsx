import { CameraView, useCameraPermissions } from "expo-camera";
import { launchImageLibraryAsync } from "expo-image-picker";

import { JSX, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Text,
  View,
} from "react-native";
import { ScalePressable } from "@/components/scale-pressable";
import { createThemedStyles, useTheme } from "@/lib/theme";


type CapturedPhoto = { uri: string; base64: string };

type ReceiptCameraSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPhoto: (base64: string) => Promise<void>;
};

/**
 * Bottom-sheet receipt capture flow. The parent conditionally mounts this
 * component so the camera session ends as soon as the sheet closes.
 * @param props Component props
 * @param props.visible Whether the sheet is open
 * @param props.onClose Closes the sheet
 * @param props.onPhoto Scans a confirmed photo
 * @returns JSX element
 */
export function ReceiptCameraSheet({
  visible,
  onClose,
  onPhoto,
}: ReceiptCameraSheetProps): JSX.Element | null {
  const styles = useStyles();
  const palette = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  if (!visible) return null;

  const close = (): void => {
    if (busy) return;
    setCaptured(null);
    setError(null);
    onClose();
  };

  const pickFromLibrary = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    const result = await launchImageLibraryAsync({
      mediaTypes: "images",
      base64: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setError("We couldn't read that photo. Choose another image and try again.");
      return;
    }
    setCaptured({ uri: asset.uri, base64: asset.base64 });
  };

  const takePhoto = async (): Promise<void> => {
    if (!cameraRef.current || !ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
      });
      if (!photo.base64) {
        setError("We couldn't read that photo. Try again.");
        return;
      }
      setCaptured({ uri: photo.uri, base64: photo.base64 });
    } catch {
      setError("The camera couldn't take that photo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const usePhoto = async (): Promise<void> => {
    if (!captured || busy) return;
    setError(null);
    setBusy(true);
    try {
      await onPhoto(captured.base64);
    } catch (photoError) {
      setError(
        photoError instanceof Error
          ? photoError.message
          : "We couldn't scan that receipt. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.topBar}>
            <Text style={styles.heading}>Scan receipt</Text>
            <ScalePressable onPress={close} accessibilityLabel="Close camera">
              <Text style={styles.closeText}>Close</Text>
            </ScalePressable>
          </View>

          {captured ? (
            <>
              <Image source={{ uri: captured.uri }} style={styles.preview} />
              <Text style={styles.helpText}>Check that the whole receipt is readable.</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <ScalePressable
                  onPress={() => {
                    setCaptured(null);
                    setError(null);
                  }}
                  disabled={busy}
                  style={[styles.secondaryButton, busy && styles.disabled]}
                >
                  <Text style={styles.secondaryText}>Retake</Text>
                </ScalePressable>
                <ScalePressable
                  onPress={usePhoto}
                  disabled={busy}
                  style={[styles.primaryButton, busy && styles.disabled]}
                >
                  {busy ? <ActivityIndicator color={palette.onAccent} /> : <Text style={styles.primaryText}>Use photo</Text>}
                </ScalePressable>
              </View>
            </>
          ) : permission === null ? (
            <View style={styles.permissionState}>
              <ActivityIndicator color={palette.accent} />
              <Text style={styles.helpText}>Checking camera permission…</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.permissionState}>
              <Text style={styles.helpText}>Camera access is needed to scan a receipt.</Text>
              {permission.canAskAgain ? (
                <ScalePressable onPress={requestPermission} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Allow camera</Text>
                </ScalePressable>
              ) : (
                <Text style={styles.error}>Enable camera access in Settings, or choose a photo below.</Text>
              )}
              <ScalePressable onPress={pickFromLibrary} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Choose from library</Text>
              </ScalePressable>
            </View>
          ) : (
            <>
              <CameraView
                ref={cameraRef}
                style={styles.preview}
                facing="back"
                mode="picture"
                autofocus="on"
                onCameraReady={() => setReady(true)}
                onMountError={(event) => setError(event.message)}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.helpText}>Fit the receipt inside the frame and keep it steady.</Text>
              <View style={styles.actionRow}>
                <ScalePressable onPress={pickFromLibrary} disabled={busy} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Library</Text>
                </ScalePressable>
                <ScalePressable onPress={takePhoto} disabled={!ready || busy} style={[styles.shutter, (!ready || busy) && styles.disabled]} accessibilityLabel="Take receipt photo">
                  <View style={styles.shutterInner} />
                </ScalePressable>
                <View style={styles.sideSpacer} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Styles for the camera sheet. */
const useStyles = createThemedStyles((palette) => ({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: palette.overlay },
  sheet: { minHeight: "68%", backgroundColor: palette.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 10, gap: 12 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginBottom: 6 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 22, fontWeight: "800", color: palette.text },
  closeText: { fontSize: 16, fontWeight: "700", color: palette.accent },
  preview: { width: "100%", height: 360, borderRadius: 16, backgroundColor: "#111" },
  helpText: { color: palette.muted, fontSize: 14, textAlign: "center" },
  error: { color: palette.error, fontSize: 14, textAlign: "center" },
  permissionState: { alignItems: "center", justifyContent: "center", gap: 16, minHeight: 360 },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  primaryButton: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 12, backgroundColor: palette.accent, paddingHorizontal: 16 },
  primaryText: { color: palette.onAccent, fontSize: 15, fontWeight: "700" },
  secondaryButton: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 12, backgroundColor: palette.accentSoft, paddingHorizontal: 16 },
  secondaryText: { color: palette.accent, fontSize: 15, fontWeight: "700" },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: palette.accent, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.accent },
  sideSpacer: { flex: 1 },
  disabled: { opacity: 0.45 },
}));
