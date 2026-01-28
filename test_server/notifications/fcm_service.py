"""
FCM Service - Firebase Cloud Messaging operations

This module handles sending push notifications via Firebase Admin SDK.
"""
import os
import firebase_admin
from firebase_admin import credentials, messaging
from .config import FIREBASE_CREDENTIALS_PATH, NOTIFICATION_TYPES

# Initialize Firebase Admin SDK
_app = None


def _get_firebase_app():
    """Initialize Firebase Admin SDK if not already initialized."""
    global _app
    if _app is not None:
        return _app

    if not os.path.exists(FIREBASE_CREDENTIALS_PATH):
        raise FileNotFoundError(
            f"Firebase credentials file not found at: {FIREBASE_CREDENTIALS_PATH}\n"
            "Please download it from Firebase Console > Project Settings > Service Accounts"
        )

    cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
    _app = firebase_admin.initialize_app(cred)
    print(f"Firebase Admin SDK initialized for project: {_app.project_id}")
    return _app


def send_to_topic(notification_type: str, data: dict = None, device_id: str = None):
    """
    Send a notification to all subscribers of a topic.

    Args:
        notification_type: One of 'pump_start', 'pump_stop', 'device_online', 'device_offline'
        data: Additional data payload to include
        device_id: Optional device ID to include in the notification

    Returns:
        str: Message ID from Firebase

    Example:
        send_to_topic('pump_start', device_id='device123')
    """
    _get_firebase_app()

    notif_config = NOTIFICATION_TYPES.get(notification_type)
    if not notif_config:
        raise ValueError(f"Unknown notification type: {notification_type}")

    # Build notification body with device ID if provided
    body = notif_config['body']
    if device_id:
        body = f"{body} (Device: {device_id})"

    # Build data payload
    payload_data = {
        'type': notification_type,
        'timestamp': str(int(__import__('time').time())),
    }
    if device_id:
        payload_data['device_id'] = device_id
    if data:
        payload_data.update({k: str(v) for k, v in data.items()})

    message = messaging.Message(
        notification=messaging.Notification(
            title=notif_config['title'],
            body=body,
        ),
        data=payload_data,
        topic=notif_config['fcm_topic'],
        # Android specific configuration
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id='beegreen_notifications',
                priority='high',
            ),
        ),
        # iOS (APNs) specific configuration
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    alert=messaging.ApsAlert(
                        title=notif_config['title'],
                        body=body,
                    ),
                    sound='default',
                    badge=1,
                ),
            ),
        ),
    )

    response = messaging.send(message)
    print(f"Notification sent: {notification_type} -> {notif_config['fcm_topic']} (ID: {response})")
    return response


def send_to_device(token: str, notification_type: str, data: dict = None, device_id: str = None):
    """
    Send a notification to a specific device.

    Args:
        token: FCM device token
        notification_type: One of 'pump_start', 'pump_stop', 'device_online', 'device_offline'
        data: Additional data payload to include
        device_id: Optional device ID to include in the notification

    Returns:
        str: Message ID from Firebase

    Example:
        send_to_device('fcm_token_here', 'pump_stop', device_id='device123')
    """
    _get_firebase_app()

    notif_config = NOTIFICATION_TYPES.get(notification_type)
    if not notif_config:
        raise ValueError(f"Unknown notification type: {notification_type}")

    body = notif_config['body']
    if device_id:
        body = f"{body} (Device: {device_id})"

    payload_data = {
        'type': notification_type,
        'timestamp': str(int(__import__('time').time())),
    }
    if device_id:
        payload_data['device_id'] = device_id
    if data:
        payload_data.update({k: str(v) for k, v in data.items()})

    message = messaging.Message(
        notification=messaging.Notification(
            title=notif_config['title'],
            body=body,
        ),
        data=payload_data,
        token=token,
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id='beegreen_notifications',
                priority='high',
            ),
        ),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    alert=messaging.ApsAlert(
                        title=notif_config['title'],
                        body=body,
                    ),
                    sound='default',
                    badge=1,
                ),
            ),
        ),
    )

    response = messaging.send(message)
    print(f"Notification sent to device: {notification_type} (ID: {response})")
    return response


def send_multicast(tokens: list, notification_type: str, data: dict = None, device_id: str = None):
    """
    Send a notification to multiple devices.

    Args:
        tokens: List of FCM device tokens
        notification_type: One of 'pump_start', 'pump_stop', 'device_online', 'device_offline'
        data: Additional data payload to include
        device_id: Optional device ID to include in the notification

    Returns:
        BatchResponse: Firebase batch response with success/failure counts
    """
    _get_firebase_app()

    notif_config = NOTIFICATION_TYPES.get(notification_type)
    if not notif_config:
        raise ValueError(f"Unknown notification type: {notification_type}")

    body = notif_config['body']
    if device_id:
        body = f"{body} (Device: {device_id})"

    payload_data = {
        'type': notification_type,
        'timestamp': str(int(__import__('time').time())),
    }
    if device_id:
        payload_data['device_id'] = device_id
    if data:
        payload_data.update({k: str(v) for k, v in data.items()})

    message = messaging.MulticastMessage(
        notification=messaging.Notification(
            title=notif_config['title'],
            body=body,
        ),
        data=payload_data,
        tokens=tokens,
    )

    response = messaging.send_each_for_multicast(message)
    print(f"Multicast sent: {response.success_count} success, {response.failure_count} failed")
    return response
