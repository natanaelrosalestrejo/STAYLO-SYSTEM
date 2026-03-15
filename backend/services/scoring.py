"""
Pure scoring helpers for hotel and event garden performance metrics.
No database or FastAPI dependencies.
"""


def calculate_hotel_score(
    occupancy_rate: float,
    pending_payments: int,
    total_reservations: int,
    cancelled_reservations: int,
) -> int:
    """Hotel health score 0-100: occupancy(40) + low pending(25) + low cancellations(20) + base(15)."""
    score = min(occupancy_rate, 100) * 0.40
    score += max(0, 25 - pending_payments * 5)
    cancel_rate = (
        (cancelled_reservations / total_reservations * 100) if total_reservations > 0 else 0
    )
    score += max(0, 20 - cancel_rate * 0.5)
    score += 15
    return min(int(round(score)), 100)


def calculate_garden_score(
    upcoming_events: int, pending_payments: int, total_events: int
) -> int:
    """Event garden performance score 0-100."""
    score = 40.0
    score += min(upcoming_events * 5, 20)
    score -= min(pending_payments * 5, 20)
    score += min(total_events * 2, 20)
    return min(max(int(round(score)), 0), 100)
