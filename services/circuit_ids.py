"""Deterministic ids for circuit structure created from a client-minted id.

A circuit run expands into slots, rounds, members, and their sets or instances.
When the client supplies the run (or round) id, every child id is derived from
it with UUIDv5, so a device offline can address members it created before the
server has seen them. The client mirrors these exact rules
(``client/src/offline/circuitIds.js``); shared vectors in
``tests/fixtures/circuit_id_vectors.json`` keep the two in lockstep.
"""
from __future__ import annotations

import uuid


def _derive(parent_id: str, name: str) -> str:
    return str(uuid.uuid5(uuid.UUID(str(parent_id)), name))


def run_slot_id(run_id: str, source_slot_id: str) -> str:
    return _derive(run_id, f"slot:{source_slot_id}")


def run_slot_instance_id(run_id: str, source_slot_id: str) -> str:
    return _derive(run_id, f"slot-instance:{source_slot_id}")


def initial_round_id(run_id: str, round_number: int) -> str:
    return _derive(run_id, f"round:{round_number}")


def round_member_id(round_id: str, run_slot_id_value: str) -> str:
    return _derive(round_id, f"member:{run_slot_id_value}")


def round_member_set_id(round_id: str, run_slot_id_value: str) -> str:
    return _derive(round_id, f"set:{run_slot_id_value}")


def round_member_instance_id(round_id: str, run_slot_id_value: str) -> str:
    return _derive(round_id, f"instance:{run_slot_id_value}")
