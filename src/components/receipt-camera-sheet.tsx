import { CameraView, useCameraPermissions } from "expo-camera";
import { launchImageLibraryAsync } from "expo-image-picker";

import { JSX, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { palette } from "@/lib/palette";

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
      <View style={STYLES.backdrop}>
        <View style={STYLES.sheet}>
          <View style={STYLES.topBar}>
            <Text style={STYLES.heading}>Scan receipt</Text>
            <Pressable onPress={close} accessibilityLabel="Close camera">
              <Text style={STYLES.closeText}>Close</Text>
            </Pressable>
          </View>

          {captured ? (
            <>
              <Image source={{ uri: captured.uri }} style={STYLES.preview} />
              <Text style={STYLES.helpText}>Check that the whole receipt is readable.</Text>
              {error ? <Text style={STYLES.error}>{error}</Text> : null}
              <View style={STYLES.actionRow}>
                <Pressable
                  onPress={() => {
                    setCaptured(null);
                    setError(null);
                  }}
                  disabled={busy}
                  style={[STYLES.secondaryButton, busy && STYLES.disabled]}
                >
                  <Text style={STYLES.secondaryText}>Retake</Text>
                </Pressable>
                <Pressable
                  onPress={usePhoto}
                  disabled={busy}
                  style={[STYLES.primaryButton, busy && STYLES.disabled]}
                >
                  {busy ? <ActivityIndicator color="white" /> : <Text style={STYLES.primaryText}>Use photo</Text>}
                </Pressable>
              </View>
            </>
          ) : permission === null ? (
            <View style={STYLES.permissionState}>
              <ActivityIndicator color={palette.accent} />
              <Text style={STYLES.helpText}>Checking camera permission…</Text>
            </View>
          ) : !permission.granted ? (
            <View style={STYLES.permissionState}>
              <Text style={STYLES.helpText}>Camera access is needed to scan a receipt.</Text>
              {permission.canAskAgain ? (
                <Pressable onPress={requestPermission} style={STYLES.primaryButton}>
                  <Text style={STYLES.primaryText}>Allow camera</Text>
                </Pressable>
              ) : (
                <Text style={STYLES.error}>Enable camera access in Settings, or choose a photo below.</Text>
              )}
              <Pressable onPress={pickFromLibrary} style={STYLES.secondaryButton}>
                <Text style={STYLES.secondaryText}>Choose from library</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <CameraView
                ref={cameraRef}
                style={STYLES.preview}
                facing="back"
                mode="picture"
                autofocus="on"
                onCameraReady={() => setReady(true)}
                onMountError={(event) => setError(event.message)}
              />
              {error ? <Text style={STYLES.error}>{error}</Text> : null}
              <Text style={STYLES.helpText}>Fit the receipt inside the frame and keep it steady.</Text>
              <View style={STYLES.actionRow}>
                <Pressable onPress={pickFromLibrary} disabled={busy} style={STYLES.secondaryButton}>
                  <Text style={STYLES.secondaryText}>Library</Text>
                </Pressable>
                <Pressable onPress={takePhoto} disabled={!ready || busy} style={[STYLES.shutter, (!ready || busy) && STYLES.disabled]} accessibilityLabel="Take receipt photo">
                  <View style={STYLES.shutterInner} />
                </Pressable>
                <View style={STYLES.sideSpacer} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Styles for the camera sheet. */
const STYLES = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { minHeight: "68%", backgroundColor: palette.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 24, fontWeight: "800", color: palette.text },
  closeText: { fontSize: 16, fontWeight: "700", color: palette.accent },
  preview: { width: "100%", height: 360, borderRadius: 16, backgroundColor: "#111" },
  helpText: { color: palette.muted, fontSize: 14, textAlign: "center" },
  error: { color: palette.error, fontSize: 14, textAlign: "center" },
  permissionState: { alignItems: "center", justifyContent: "center", gap: 16, minHeight: 360 },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  primaryButton: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 12, backgroundColor: palette.accent, paddingHorizontal: 16 },
  primaryText: { color: "white", fontSize: 15, fontWeight: "700" },
  secondaryButton: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 12, backgroundColor: palette.accentSoft, paddingHorizontal: 16 },
  secondaryText: { color: palette.accent, fontSize: 15, fontWeight: "700" },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: palette.accent, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.accent },
  sideSpacer: { flex: 1 },
  disabled: { opacity: 0.45 },
});
