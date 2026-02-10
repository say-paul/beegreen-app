"""
MQTT Handler - Listens for device events and triggers FCM notifications

This service subscribes to MQTT topics for pump and device status changes,
then sends push notifications via FCM.

Usage:
    python -m test_server.notifications.mqtt_handler

Environment variables:
    MQTT_BROKER - MQTT broker hostname (default: localhost)
    MQTT_PORT - MQTT broker port (default: 1883)
    MQTT_USERNAME - MQTT username (optional)
    MQTT_PASSWORD - MQTT password (optional)
"""
import re
import paho.mqtt.client as mqtt
from . import fcm_service
from .config import MQTT_CONFIG, MQTT_TOPICS
from .payload_parser import (
    parse_payload_with_timestamp,
    is_truthy,
    is_falsy,
    is_message_recent,
    get_message_age_seconds,
    DEFAULT_MAX_AGE_SECONDS,
)


def extract_device_id(topic: str) -> str:
    """Extract device ID from MQTT topic."""
    # Topic format: {device_id}/topic_name
    parts = topic.split('/')
    return parts[0] if parts else None


def on_connect(client, userdata, flags, rc):
    """Callback when connected to MQTT broker."""
    if rc == 0:
        print(f"Connected to MQTT broker: {MQTT_CONFIG['broker']}:{MQTT_CONFIG['port']}")

        # Subscribe to all configured topics
        for topic_name, topic_pattern in MQTT_TOPICS.items():
            client.subscribe(topic_pattern)
            print(f"Subscribed to: {topic_pattern}")
    else:
        print(f"Failed to connect to MQTT broker. Return code: {rc}")


def on_disconnect(client, userdata, rc):
    """Callback when disconnected from MQTT broker."""
    print(f"Disconnected from MQTT broker. Return code: {rc}")
    if rc != 0:
        print("Unexpected disconnection. Will attempt to reconnect...")


def on_message(client, userdata, msg):
    """Callback when message received from MQTT broker."""
    topic = msg.topic
    try:
        raw_payload = msg.payload.decode('utf-8')
    except UnicodeDecodeError:
        print(f"Failed to decode message payload from topic: {topic}")
        return

    device_id = extract_device_id(topic)
    payload, timestamp = parse_payload_with_timestamp(raw_payload)
    age_seconds = get_message_age_seconds(timestamp)
    age_str = f"{age_seconds:.1f}s ago" if age_seconds is not None else "no timestamp"
    
    print(f"Message received - Topic: {topic}, Parsed: {payload}, Age: {age_str}, Device: {device_id}")

    try:
        # Handle pump status changes: {deviceID}/pump_status
        if topic.endswith('/pump_status'):
            # Check if message is recent (skip stale retained messages)
            if not is_message_recent(timestamp):
                print(f">>> SKIPPED: Message is stale ({age_str}, max {DEFAULT_MAX_AGE_SECONDS}s)")
                return
                
            if is_truthy(payload):
                print(f">>> Triggering PUMP_START notification for device: {device_id}")
                result = fcm_service.send_to_topic('pump_start', device_id=device_id)
                print(f">>> FCM Response: {result}")
            elif is_falsy(payload):
                print(f">>> Triggering PUMP_STOP notification for device: {device_id}")
                result = fcm_service.send_to_topic('pump_stop', device_id=device_id)
                print(f">>> FCM Response: {result}")
            else:
                print(f">>> Unknown pump_status payload: '{payload}' (not triggering notification)")

        # Handle device online/offline status: {deviceID}/status
        elif topic.endswith('/status'):
            # For OFFLINE status: always send (important to know device is down)
            # For ONLINE status: check if message is recent
            is_offline = is_falsy(payload)
            
            if not is_offline and not is_message_recent(timestamp):
                print(f">>> SKIPPED: Online message is stale ({age_str}, max {DEFAULT_MAX_AGE_SECONDS}s)")
                return
            
            if is_truthy(payload):
                print(f">>> Triggering DEVICE_ONLINE notification for device: {device_id}")
                result = fcm_service.send_to_topic('device_online', device_id=device_id)
                print(f">>> FCM Response: {result}")
            elif is_offline:
                print(f">>> Triggering DEVICE_OFFLINE notification for device: {device_id} (always sent)")
                result = fcm_service.send_to_topic('device_offline', device_id=device_id)
                print(f">>> FCM Response: {result}")
            else:
                print(f">>> Unknown status payload: '{payload}' (not triggering notification)")
        else:
            print(f">>> Topic '{topic}' doesn't match pump_status or status patterns")

    except Exception as e:
        print(f"!!! ERROR sending notification: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()


def create_client() -> mqtt.Client:
    """Create and configure MQTT client."""
    client = mqtt.Client(client_id=MQTT_CONFIG['client_id'])

    # Set callbacks
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    # Set authentication if provided
    if MQTT_CONFIG['username'] and MQTT_CONFIG['password']:
        client.username_pw_set(MQTT_CONFIG['username'], MQTT_CONFIG['password'])

    # Enable TLS for secure connection (required for HiveMQ Cloud)
    if MQTT_CONFIG.get('use_tls', False):
        import ssl
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS)
        print("TLS enabled for secure connection")

    return client


def start():
    """Start the MQTT handler service."""
    print("Starting BeeGreen Notification Service...")
    print(f"Connecting to MQTT broker: {MQTT_CONFIG['broker']}:{MQTT_CONFIG['port']}")

    client = create_client()

    try:
        client.connect(MQTT_CONFIG['broker'], MQTT_CONFIG['port'], keepalive=60)
        print("Starting MQTT loop (Ctrl+C to stop)...")
        client.loop_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        client.disconnect()
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == '__main__':
    start()
