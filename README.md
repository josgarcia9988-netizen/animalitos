# 🎯 Sistema de Predicciones Animalitos

Sistema avanzado de predicciones para lotería de animalitos con inteligencia artificial y notificaciones por Telegram.

## 🚀 Características

- **🧠 Algoritmo de IA Avanzado**: Red neuronal multicapa con análisis de patrones cuánticos
- **📊 Análisis en Tiempo Real**: Monitoreo automático de resultados
- **🤖 Bot de Telegram**: Notificaciones automáticas y comandos interactivos
- **📈 Estadísticas Detalladas**: Seguimiento de efectividad y análisis histórico
- **🎨 Interfaz Web**: Dashboard moderno con visualización de predicciones

## 🛠️ Tecnologías

- **Backend**: Node.js + Express
- **Frontend**: HTML5, CSS3, JavaScript
- **IA**: Redes neuronales, Cadenas de Markov, Análisis cuántico
- **Notificaciones**: Telegram Bot API
- **Datos**: JSON persistente

## 📱 Comandos del Bot de Telegram

- `/start` - Iniciar el sistema
- `/status` - Ver estado del sistema
- `/predictions` - Obtener predicciones actuales
- `/last` - Ver últimos 10 resultados
- `/stats` - Ver efectividad de últimas 10 predicciones
- `/auto` - Activar notificaciones automáticas
- `/auto-off` - Desactivar notificaciones automáticas
- `/help` - Ver ayuda

## 🔧 Instalación

1. Clonar el repositorio
```bash
git clone https://github.com/josgarcia9988-netizen/animalitos.git
cd animalitos
```

2. Instalar dependencias
```bash
npm install
```

3. Configurar variables de entorno (opcional)
```bash
# Puerto del servidor (por defecto: 8000)
PORT=8000

# MongoDB Atlas Configuration
MONGODB_USERNAME=josgarcia9988
MONGODB_PASSWORD=Chuchu2412..
MONGODB_CLUSTER=cluster0.cjgqs9q.mongodb.net
MONGODB_DATABASE=animalitos_db

# Configuración del Bot de Telegram
TELEGRAM_BOT_TOKEN=7634433496:AAHaeQscZ2szJwt8MQusGZVXORZHxV_w4VY
TELEGRAM_CHAT_IDS=6912929677

# Notas:
# - TELEGRAM_CHAT_IDS: Separar múltiples Chat IDs con comas (ej: "123456789,987654321")
# - TELEGRAM_BOT_TOKEN: Token del bot obtenido de @BotFather en Telegram
# - MONGODB_*: Credenciales de MongoDB Atlas para persistencia de datos
```

4. Iniciar el servidor
```bash
npm start
```

## 🌐 Despliegue en Render

1. Conectar repositorio de GitHub a Render
2. Configurar como Web Service
3. Comando de build: `npm install`
4. Comando de start: `npm start`
5. Puerto: 8000

### 🔧 Configuración de Variables de Entorno en Render:

**IMPORTANTE:** Para que MongoDB funcione correctamente, debes configurar estas variables en el dashboard de Render:

| Variable | Valor |
|----------|-------|
| `MONGODB_USERNAME` | `josgarcia9988` |
| `MONGODB_PASSWORD` | `Chuchu2412..` |
| `MONGODB_CLUSTER` | `cluster0.cjgqs9q.mongodb.net` |
| `MONGODB_DATABASE` | `animalitos_db` |
| `TELEGRAM_BOT_TOKEN` | `7634433496:AAHaeQscZ2szJwt8MQusGZVXORZHxV_w4VY` |
| `TELEGRAM_CHAT_IDS` | `6912929677` |
| `NODE_ENV` | `production` |
| `PORT` | `8000` |

**Pasos detallados:**
1. Ve a tu dashboard de Render
2. Selecciona tu servicio `animalitos-predictions`
3. Ve a la pestaña "Environment"
4. Haz clic en "Environment Variables"
5. Agrega cada variable con su valor correspondiente
6. Guarda los cambios
7. Ve a "Manual Deploy" y haz clic en "Deploy latest commit"

**Verificación:**
Después de configurar las variables, deberías ver en los logs:
```
✅ Conectado exitosamente a MongoDB Atlas!
📊 Índices creados exitosamente
```

**Solución de problemas SSL:**
Si ves errores SSL, el sistema automáticamente intentará con configuración alternativa:
```
🔄 Intentando reconexión con configuración SSL alternativa...
✅ Conectado exitosamente con configuración SSL alternativa!
```

## 📊 Funcionalidades

### Sistema de Predicciones
- Análisis de patrones históricos
- Red neuronal multicapa
- Detección de ciclos y tendencias
- Predicciones balanceadas por colores

### Notificaciones Inteligentes
- Alerta cuando se alcanza 50% de aciertos
- Notificaciones automáticas de resultados
- Estadísticas de efectividad en tiempo real

### Dashboard Web
- Visualización de predicciones actuales
- Historial de resultados
- Estadísticas de efectividad
- Modal de detalles por animal

## 🎯 Precisión

El sistema utiliza múltiples técnicas de IA para maximizar la precisión:
- Análisis de temperatura de animales
- Patrones temporales y secuenciales
- Cadenas de Markov de orden 1, 2 y 3
- Detección de mega-ciclos
- Comportamiento emergente

## 📈 Métricas

- **Aciertos de Animales**: Predicción correcta del número
- **Aciertos de Colores**: Predicción correcta del color
- **Efectividad General**: Combinación de ambas métricas
- **Historial Completo**: Seguimiento de todas las predicciones

## 🔒 Seguridad

- Validación de datos de entrada
- Manejo seguro de tokens de Telegram
- Prevención de spam en notificaciones

## 📞 Soporte

Para reportar problemas o sugerencias, crear un issue en el repositorio de GitHub.

---

**Desarrollado con ❤️ para maximizar tus ganancias en animalitos** 🎲
