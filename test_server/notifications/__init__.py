"""
BeeGreen Notifications Backend Module

This module handles sending FCM push notifications for device events:
- Pump start/stop
- Device online/offline

Usage:
    python -m test_server.notifications.mqtt_handler
"""

from .fcm_service import send_to_topic, send_to_device
from .config import NOTIFICATION_TYPES
from .payload_parser import (
    parse_payload,
    parse_payload_with_timestamp,
    parse_timestamp,
    is_truthy,
    is_falsy,
    is_message_recent,
    get_message_age_seconds,
)

__all__ = [
    'send_to_topic',
    'send_to_device',
    'NOTIFICATION_TYPES',
    'parse_payload',
    'parse_payload_with_timestamp',
    'parse_timestamp',
    'is_truthy',
    'is_falsy',
    'is_message_recent',
    'get_message_age_seconds',
]
