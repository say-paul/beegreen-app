"""
Payload Parser - Extracts values from MQTT message payloads.

Handles various payload formats:
- Plain strings: "online", "1", "off"
- JSON with 'payload' field: {"payload": "online", "timestamp": "..."}
- JSON with alternative fields: {"value": 1}, {"status": "on"}, {"state": true}

Usage:
    from .payload_parser import parse_payload, parse_payload_with_timestamp
    
    value = parse_payload('{"payload": "online", "timestamp": "2025-01-01"}')
    # Returns: "online"
    
    value, ts = parse_payload_with_timestamp('{"payload": "online", "timestamp": "2025-01-01 12:00:00"}')
    # Returns: ("online", datetime object or None)
"""
import json
from datetime import datetime, timedelta
from typing import Any, Optional, Tuple


# Fields to check in JSON payloads, in order of priority
PAYLOAD_FIELDS = ['payload', 'value', 'status', 'state', 'data']

# Fields that may contain timestamp
TIMESTAMP_FIELDS = ['timestamp', 'time', 'ts', 'datetime', 'date']

# Supported timestamp formats
TIMESTAMP_FORMATS = [
    '%Y-%m-%d %H:%M:%S',      # 2025-12-23 18:13:31
    '%Y-%m-%dT%H:%M:%S',      # 2025-12-23T18:13:31
    '%Y-%m-%dT%H:%M:%SZ',     # 2025-12-23T18:13:31Z
    '%Y-%m-%dT%H:%M:%S.%f',   # 2025-12-23T18:13:31.123
    '%Y-%m-%dT%H:%M:%S.%fZ',  # 2025-12-23T18:13:31.123Z
    '%Y/%m/%d %H:%M:%S',      # 2025/12/23 18:13:31
    '%d-%m-%Y %H:%M:%S',      # 23-12-2025 18:13:31
]

# Default max age for messages (in seconds)
DEFAULT_MAX_AGE_SECONDS = 60


def parse_payload(raw_payload: str) -> str:
    """
    Parse MQTT payload and extract the actual value.
    
    Args:
        raw_payload: Raw MQTT message payload as string
        
    Returns:
        Extracted value as lowercase string
        
    Examples:
        >>> parse_payload('online')
        'online'
        >>> parse_payload('{"payload": "offline", "timestamp": "..."}')
        'offline'
        >>> parse_payload('{"value": 1}')
        '1'
        >>> parse_payload('{"state": true}')
        'true'
    """
    if not raw_payload:
        return ''
    
    raw_payload = raw_payload.strip()
    
    # Try to parse as JSON
    json_value = _extract_from_json(raw_payload)
    if json_value is not None:
        return _normalize_value(json_value)
    
    # Return as plain string
    return raw_payload.lower()


def _extract_from_json(raw_payload: str) -> Optional[Any]:
    """
    Try to extract value from JSON payload.
    
    Returns None if not valid JSON or no known field found.
    """
    try:
        data = json.loads(raw_payload)
        
        if not isinstance(data, dict):
            # JSON but not an object (e.g., just a number or string)
            return data
        
        # Check known payload fields in priority order
        for field in PAYLOAD_FIELDS:
            if field in data:
                return data[field]
        
        # No known field found
        return None
        
    except (json.JSONDecodeError, TypeError):
        return None


def _normalize_value(value: Any) -> str:
    """
    Normalize extracted value to lowercase string.
    
    Handles:
    - Booleans: True -> 'true', False -> 'false'
    - Numbers: 1 -> '1', 0 -> '0'
    - Strings: 'ON' -> 'on'
    """
    if isinstance(value, bool):
        return 'true' if value else 'false'
    
    if isinstance(value, (int, float)):
        return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value)
    
    return str(value).lower().strip()


def is_truthy(value: str) -> bool:
    """
    Check if a parsed value represents a "true" or "on" state.
    
    Args:
        value: Parsed payload value (from parse_payload)
        
    Returns:
        True if value indicates on/true/online state
    """
    return value in ('1', 'on', 'true', 'online', 'connected', 'started', 'yes', 'active')


def is_falsy(value: str) -> bool:
    """
    Check if a parsed value represents a "false" or "off" state.
    
    Args:
        value: Parsed payload value (from parse_payload)
        
    Returns:
        True if value indicates off/false/offline state
    """
    return value in ('0', 'off', 'false', 'offline', 'disconnected', 'stopped', 'no', 'inactive')


def parse_timestamp(raw_payload: str) -> Optional[datetime]:
    """
    Extract timestamp from MQTT payload.
    
    Args:
        raw_payload: Raw MQTT message payload as string
        
    Returns:
        datetime object if timestamp found and parsed, None otherwise
    """
    if not raw_payload:
        return None
    
    try:
        data = json.loads(raw_payload.strip())
        if not isinstance(data, dict):
            return None
        
        # Find timestamp field
        ts_value = None
        for field in TIMESTAMP_FIELDS:
            if field in data:
                ts_value = data[field]
                break
        
        if ts_value is None:
            return None
        
        # Try to parse timestamp
        return _parse_timestamp_value(ts_value)
        
    except (json.JSONDecodeError, TypeError):
        return None


def _parse_timestamp_value(ts_value: Any) -> Optional[datetime]:
    """Parse a timestamp value into datetime."""
    if ts_value is None:
        return None
    
    # If already a number (unix timestamp)
    if isinstance(ts_value, (int, float)):
        try:
            return datetime.fromtimestamp(ts_value)
        except (ValueError, OSError):
            return None
    
    # Try string formats
    ts_str = str(ts_value).strip()
    
    for fmt in TIMESTAMP_FORMATS:
        try:
            return datetime.strptime(ts_str, fmt)
        except ValueError:
            continue
    
    return None


def parse_payload_with_timestamp(raw_payload: str) -> Tuple[str, Optional[datetime]]:
    """
    Parse payload and extract both value and timestamp.
    
    Args:
        raw_payload: Raw MQTT message payload
        
    Returns:
        Tuple of (parsed_value, timestamp or None)
        
    Example:
        >>> parse_payload_with_timestamp('{"payload": "online", "timestamp": "2025-01-01 12:00:00"}')
        ('online', datetime(2025, 1, 1, 12, 0, 0))
    """
    value = parse_payload(raw_payload)
    timestamp = parse_timestamp(raw_payload)
    return value, timestamp


def is_message_recent(timestamp: Optional[datetime], max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS) -> bool:
    """
    Check if a message timestamp is recent enough to process.
    
    Args:
        timestamp: Parsed timestamp from message (None = no timestamp, treat as recent)
        max_age_seconds: Maximum age in seconds for a message to be considered recent
        
    Returns:
        True if message is recent or has no timestamp
    """
    if timestamp is None:
        # No timestamp means we can't determine age, treat as recent
        return True
    
    now = datetime.now()
    age = now - timestamp
    
    return age <= timedelta(seconds=max_age_seconds)


def get_message_age_seconds(timestamp: Optional[datetime]) -> Optional[float]:
    """
    Get the age of a message in seconds.
    
    Args:
        timestamp: Parsed timestamp from message
        
    Returns:
        Age in seconds, or None if no timestamp
    """
    if timestamp is None:
        return None
    
    now = datetime.now()
    age = now - timestamp
    return age.total_seconds()
