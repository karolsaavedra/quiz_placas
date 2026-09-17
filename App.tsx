import * as ImageManipulator from "expo-image-manipulator";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";

const API_URL = "http://54.210.11.61:8080/predict/";

const seleccionarPlaca = (
  placas: string[],
  detections: any[]
): string | null => {
  if (!Array.isArray(placas) || placas.length === 0) {
    return null;
  }

  const candidatos = placas
    .map((placa) => {
      const texto = String(placa)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

      return {
        original: texto,
        texto,
      };
    })
    .filter((item) => /^[A-Z]{3}[0-9]{3,4}$/.test(item.texto));

  if (candidatos.length === 0) {
    return null;
  }

  // Si tenemos detecciones, intentamos relacionar
  // el texto con una detección real de YOLO.
  const candidatosConDeteccion = candidatos.map((candidato) => {
    const deteccion = Array.isArray(detections)
      ? detections.find(
          (d: any) =>
            String(d?.text || "")
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "") === candidato.texto
        )
      : null;

    return {
      ...candidato,
      confidence: deteccion?.confidence ?? 0,
    };
  });

  // Ordenar por confianza de YOLO.
  candidatosConDeteccion.sort(
    (a, b) => b.confidence - a.confidence
  );

  let resultado = candidatosConDeteccion[0].texto;

  // Si OCR devuelve 7 caracteres con formato ABC1234,
  // probamos quitar un carácter final cuando sea claramente
  // un dígito adicional.
  if (
    resultado.length === 7 &&
    /^[A-Z]{3}[0-9]{4}$/.test(resultado)
  ) {
    resultado = resultado.substring(0, 6);
  }

  return resultado;
};

export default function App() {
  const [cameraPermission, requestCameraPermission] =
    useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);

  const [cameraVisible, setCameraVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================
  // GALERÍA
  // =========================

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    const uri = result.assets[0].uri;

    setSelectedImage(uri);
    setPlate("");

    await sendImage(uri);
  };

  // =========================
  // CÁMARA
  // =========================

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();

      if (!permission.granted) {
        Alert.alert(
          "Permiso necesario",
          "Debes permitir el acceso a la cámara."
        );
        return;
      }
    }

    setCameraVisible(true);
    setPlate("");
  };

  const takePhoto = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
      });

      if (!photo?.uri) {
        Alert.alert("Error", "No se pudo tomar la fotografía.");
        return;
      }

      setCameraVisible(false);
      setSelectedImage(photo.uri);
      setPlate("");

      await sendImage(photo.uri);
    } catch (error) {
      console.log("Error tomando foto:", error);

      Alert.alert(
        "Error",
        "No se pudo tomar la fotografía."
      );
    }
  };

  // =========================
  // ENVIAR IMAGEN A AWS
  // =========================
const prepararImagen = async (uri: string): Promise<string> => {
  const resultado = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        resize: {
          width: 1600,
        },
      },
    ],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return resultado.uri;
};

  const sendImage = async (uri: string) => {
  try {
    setLoading(true);
    setPlate("");

    console.log("Preparando imagen...");

    const imagenOptimizada = await prepararImagen(uri);

    console.log("Imagen optimizada:", imagenOptimizada);

    const formData = new FormData();

    formData.append("file", {
      uri: imagenOptimizada,
      name: "placa.jpg",
      type: "image/jpeg",
    } as any);

      const response = await axios.post(API_URL, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      console.log("Respuesta AWS:", response.data);

      if (
        response.data?.success &&
        Array.isArray(response.data?.placas) &&
        response.data.placas.length > 0
      ) {
        const placaSeleccionada = seleccionarPlaca(
          response.data.placas,
          response.data.detections
        );

        if (placaSeleccionada) {
          setPlate(placaSeleccionada);
        } else {
          setPlate("No se detectó ninguna placa válida");
        }
      } else {
        setPlate("No se detectó ninguna placa");
      }
    } catch (error: any) {
      console.log("Error:", error);

      Alert.alert(
        "Error de conexión",
        "No fue posible comunicarse con el servidor de AWS."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // PANTALLA DE CÁMARA
  // =========================

  if (cameraVisible) {
  return (
    <SafeAreaView style={styles.cameraContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      />

      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => setCameraVisible(false)}
      >
        <Text style={styles.closeButtonText}>
          Cerrar
        </Text>
      </TouchableOpacity>

      <View style={styles.cameraControls}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePhoto}
        >
          <Text style={styles.captureButtonText}>
            📸 TOMAR FOTO
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

  // =========================
  // PANTALLA PRINCIPAL
  // =========================

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        <Text style={styles.title}>
          Detector de Placas
        </Text>

        <Text style={styles.subtitle}>
          Reconocimiento automático de placas vehiculares
        </Text>

        {selectedImage && (
          <Image
            source={{ uri: selectedImage }}
            style={styles.preview}
          />
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={openCamera}
        >
          <Text style={styles.buttonText}>
            📷 Tomar foto
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={pickImage}
        >
          <Text style={styles.buttonText}>
            🖼️ Elegir de galería
          </Text>
        </TouchableOpacity>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator
              size="large"
              color="#FFC64F"
            />

            <Text style={styles.loadingText}>
              Analizando placa...
            </Text>
          </View>
        )}

        {plate !== "" && !loading && (
          <View style={styles.result}>

            <Text style={styles.resultTitle}>
              Placa detectada
            </Text>

            <Text style={styles.plateText}>
              {plate}
            </Text>

          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#641717",
  },

  content: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: "#F5DADA",
    textAlign: "center",
    marginBottom: 25,
  },

  preview: {
    width: "100%",
    height: 220,
    borderRadius: 15,
    marginBottom: 20,
  },

  button: {
    width: "100%",
    backgroundColor: "#FFC64F",
    padding: 16,
    borderRadius: 12,
    marginVertical: 7,
    alignItems: "center",
  },

  buttonText: {
    color: "#641717",
    fontSize: 17,
    fontWeight: "bold",
  },

  loading: {
    marginTop: 25,
    alignItems: "center",
  },

  loadingText: {
    color: "#FFFFFF",
    marginTop: 10,
    fontSize: 16,
  },

  result: {
    marginTop: 25,
    width: "100%",
    backgroundColor: "#FAF0F0",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
  },

  resultTitle: {
    fontSize: 18,
    color: "#641717",
    marginBottom: 8,
  },

  plateText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#641717",
    letterSpacing: 3,
  },

  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },

  camera: {
    position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  },

  cameraControls: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 45,
  },

  closeButton: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "#641717",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },

  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },

captureButton: {
  backgroundColor: "#FFC64F",
  paddingVertical: 16,
  paddingHorizontal: 35,
  borderRadius: 15,
  alignItems: "center",
  justifyContent: "center",
},

captureButtonText: {
  color: "#641717",
  fontSize: 18,
  fontWeight: "bold",
},
});