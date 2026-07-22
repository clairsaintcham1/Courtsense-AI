"""
Seed script for the drill_library table — populates 25 real basketball drills
across all 7 categories with text-embedding-3-small embeddings.

Usage:
    cd backend && python -m app.services.seed_drills
"""

import asyncio
import os
import sys
from typing import Any

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from openai import AsyncOpenAI
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.training import DrillCategory, DrillLibrary
from app.models.athlete import SkillLevel

# ---------------------------------------------------------------------------
# Drill definitions — 25 real basketball drills
# ---------------------------------------------------------------------------

DRILLS: list[dict[str, Any]] = [
    # ── Shooting (4 drills) ──────────────────────────────────────────
    {
        "name": "Form Shooting (One-Hand)",
        "category": DrillCategory.shooting,
        "difficulty": SkillLevel.beginner,
        "description": "Stand 3-5 feet from the basket. Use only your shooting hand (guide hand behind your back). Focus on proper elbow alignment, wrist snap, and follow-through. Make 10 shots from each side of the key.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 10,
    },
    {
        "name": "Spot-Up Shooting Progression",
        "category": DrillCategory.shooting,
        "difficulty": SkillLevel.intermediate,
        "description": "Make 5 shots from 5 spots around the arc (corners, wings, top). Focus on consistent footwork — catch, square up, shoot in one motion. Track makes vs attempts.",
        "equipment_needed": "basketball, hoop, cones (optional)",
        "duration_minutes": 15,
    },
    {
        "name": "Off-the-Dribble Pull-Up Series",
        "category": DrillCategory.shooting,
        "difficulty": SkillLevel.advanced,
        "description": "Dribble from the wing to the elbow, pull up for a jump shot. Alternate between going left and right. Focus on deceleration, balance, and high release. 3 sets of 5 from each direction.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 12,
    },
    {
        "name": "Free Throw Routine (Pressure Simulation)",
        "category": DrillCategory.shooting,
        "difficulty": SkillLevel.intermediate,
        "description": "Shoot 20 free throws with a consistent pre-shot routine. Between each shot, do 5 push-ups or a short sprint to simulate game fatigue. Goal: 15+ makes at intermediate level.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 8,
    },
    # ── Dribbling / Ball Handling (4 drills) ──────────────────────────
    {
        "name": "Stationary Two-Ball Dribbling",
        "category": DrillCategory.dribbling,
        "difficulty": SkillLevel.intermediate,
        "description": "Dribble two basketballs simultaneously while stationary. Progress through patterns: both together, alternating, one high one low, cross-over with one ball while pounding the other. 3 sets of 30 seconds each pattern.",
        "equipment_needed": "2 basketballs",
        "duration_minutes": 10,
    },
    {
        "name": "Cone Dribble Weave",
        "category": DrillCategory.dribbling,
        "difficulty": SkillLevel.beginner,
        "description": "Set up 6-8 cones in a line spaced 3 feet apart. Dribble through the cones using crossovers, between-the-legs, and behind-the-back moves. Keep your head up throughout. 4 passes total: 2 right hand, 2 left hand.",
        "equipment_needed": "basketball, cones",
        "duration_minutes": 10,
    },
    {
        "name": "Full-Court Speed Dribble",
        "category": DrillCategory.dribbling,
        "difficulty": SkillLevel.advanced,
        "description": "Dribble at full speed from baseline to baseline. Alternate hands at half-court. Focus on pushing the ball ahead without losing control. Complete 6 full-court sprints with 30 seconds rest between each.",
        "equipment_needed": "basketball",
        "duration_minutes": 10,
    },
    {
        "name": "Tennis Ball Toss Dribbling",
        "category": DrillCategory.dribbling,
        "difficulty": SkillLevel.advanced,
        "description": "Dribble with one hand while tossing a tennis ball up and catching it with the other hand. Progress to tossing the tennis ball against a wall. Forces hand independence and keeps eyes up. 3 sets of 45 seconds.",
        "equipment_needed": "basketball, tennis ball",
        "duration_minutes": 8,
    },
    # ── Footwork (3 drills) ───────────────────────────────────────────
    {
        "name": "Mikan Drill",
        "category": DrillCategory.footwork,
        "difficulty": SkillLevel.beginner,
        "description": "Stand under the basket. Alternate layups from the left and right side without letting the ball hit the ground. Focus on proper footwork: right hand layup from left foot, left hand layup from right foot. Make 20 layups.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 7,
    },
    {
        "name": "Ladder Agility Series",
        "category": DrillCategory.footwork,
        "difficulty": SkillLevel.intermediate,
        "description": "Using an agility ladder, complete the following patterns: one foot per rung, two feet per rung, in-and-out, lateral shuffle, and Icky Shuffle. 2 passes through each pattern. Focus on quick, light feet.",
        "equipment_needed": "agility ladder",
        "duration_minutes": 10,
    },
    {
        "name": "Pivot Series (Drop Step, Front Pivot, Reverse Pivot)",
        "category": DrillCategory.footwork,
        "difficulty": SkillLevel.beginner,
        "description": "From a triple-threat position, practice drop steps, front pivots, and reverse pivots. Add a jump shot or drive after each pivot. 10 reps per pivot type on each foot. Emphasize keeping pivot foot planted.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 10,
    },
    # ── Defense (4 drills) ────────────────────────────────────────────
    {
        "name": "Defensive Slides (Zig-Zag)",
        "category": DrillCategory.defense,
        "difficulty": SkillLevel.beginner,
        "description": "Start on the baseline. Slide diagonally to the free-throw line extended, then change direction and slide to half-court. Keep a low stance with wide base, hands out. Do not cross your feet. 3 full-court reps.",
        "equipment_needed": "cones (optional)",
        "duration_minutes": 8,
    },
    {
        "name": "Close-Out Drill",
        "category": DrillCategory.defense,
        "difficulty": SkillLevel.intermediate,
        "description": "Start in the paint, sprint to close out on a shooter at the three-point line. Chop your feet on arrival, hands high. Partner (or imagine opponent) pump fakes — stay down, contest the shot without fouling. 10 reps.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 8,
    },
    {
        "name": "Shell Drill (4-on-4)",
        "category": DrillCategory.defense,
        "difficulty": SkillLevel.advanced,
        "description": "Four offensive players pass the ball around the perimeter while four defenders practice positioning: on-ball pressure, one-pass-away denial, two-passes-away help. Rotate positions every 45 seconds. 4 rotations.",
        "equipment_needed": "basketball, hoop (team drill)",
        "duration_minutes": 10,
    },
    {
        "name": "Mirror Drill (1-on-1 Containment)",
        "category": DrillCategory.defense,
        "difficulty": SkillLevel.intermediate,
        "description": "One offensive player tries to beat the defender from the wing. Defender works on containing dribble penetration without reaching or fouling. Stay in front, move your feet, force to the baseline. 5 reps, switch roles.",
        "equipment_needed": "basketball, hoop",
        "duration_minutes": 8,
    },
    # ── Passing (3 drills) ────────────────────────────────────────────
    {
        "name": "Partner Passing (Chest, Bounce, Overhead)",
        "category": DrillCategory.passing,
        "difficulty": SkillLevel.beginner,
        "description": "Stand 10-15 feet from a partner. Complete 20 chest passes, 20 bounce passes, and 20 overhead passes. Focus on accuracy (hit partner's chest), stepping into the pass, and receiving with soft hands.",
        "equipment_needed": "basketball, partner",
        "duration_minutes": 8,
    },
    {
        "name": "Outlet Passing on the Move",
        "category": DrillCategory.passing,
        "difficulty": SkillLevel.intermediate,
        "description": "Simulate a defensive rebound, pivot, and throw a long outlet pass to a partner sprinting downcourt. Lead the receiver with the pass. 10 reps from each baseline side. Focus on accuracy and timing.",
        "equipment_needed": "basketball, partner",
        "duration_minutes": 10,
    },
    {
        "name": "Two-Person Passing into Layups",
        "category": DrillCategory.passing,
        "difficulty": SkillLevel.intermediate,
        "description": "Two players start at half-court and pass back and forth while moving toward the basket. The last pass leads to a layup. Alternate who finishes. No traveling, no dribbling. 10 makes each.",
        "equipment_needed": "basketball, hoop, partner",
        "duration_minutes": 8,
    },
    # ── Conditioning (3 drills) ───────────────────────────────────────
    {
        "name": "Suicide Sprints (Conditioning Ladder)",
        "category": DrillCategory.conditioning,
        "difficulty": SkillLevel.intermediate,
        "description": "Run from the baseline to the free-throw line and back, then to half-court and back, then to the far free-throw line and back, then full-court and back. This is one rep. Complete 3 reps with 1-minute rest between.",
        "equipment_needed": "none (court required)",
        "duration_minutes": 8,
    },
    {
        "name": "17s (Sideline Sprint Drill)",
        "category": DrillCategory.conditioning,
        "difficulty": SkillLevel.advanced,
        "description": "Run sideline to sideline 17 times in under 1 minute. This classic conditioning test builds speed endurance. Rest 2 minutes, repeat 2 more times. Track your best time.",
        "equipment_needed": "none (court required)",
        "duration_minutes": 10,
    },
    {
        "name": "Jump Rope Intervals",
        "category": DrillCategory.conditioning,
        "difficulty": SkillLevel.beginner,
        "description": "Jump rope for 45 seconds on, 15 seconds rest. Rotate through: two-foot, alternating feet, high knees, and double-unders (if able). 6 rounds total. Great for foot speed and conditioning.",
        "equipment_needed": "jump rope",
        "duration_minutes": 8,
    },
    # ── Basketball IQ / Decision Making (4 drills) ─────────────────────
    {
        "name": "3-on-2, 2-on-1 Fast Break Drill",
        "category": DrillCategory.iq,
        "difficulty": SkillLevel.intermediate,
        "description": "Three offensive players attack two defenders, then after a shot, the two defenders become offense going the other way against one defender (the third offensive player). Focus on spacing, passing decisions, and transition defense. 8 reps.",
        "equipment_needed": "basketball, hoop (team drill)",
        "duration_minutes": 12,
    },
    {
        "name": "Read the Defense — Pick and Roll Decision",
        "category": DrillCategory.iq,
        "difficulty": SkillLevel.advanced,
        "description": "Come off a screen and read the defender: if they go under, pull up; if they trail, attack the rim; if they hedge hard, split or reject the screen. A coach or partner signals the defensive coverage. 10 reps.",
        "equipment_needed": "basketball, hoop, partner",
        "duration_minutes": 10,
    },
    {
        "name": "Advantage Start 1-on-1",
        "category": DrillCategory.iq,
        "difficulty": SkillLevel.intermediate,
        "description": "Offensive player starts with the ball at the wing with a one-dribble advantage. Must read the defender and decide: attack the rim, pull up, or step back. Defender plays live. 5 reps then switch. Focus on quick decisions.",
        "equipment_needed": "basketball, hoop, partner",
        "duration_minutes": 8,
    },
    {
        "name": "Film Study — Recognize Defensive Schemes",
        "category": DrillCategory.iq,
        "difficulty": SkillLevel.advanced,
        "description": "Watch 5 minutes of game film (NBA, college, or your own). Pause at each defensive setup and identify: man-to-man or zone? Where are the gaps? What's the best counter? Write down your observations. Discuss with a coach or teammate.",
        "equipment_needed": "video access, notebook",
        "duration_minutes": 10,
    },
]


async def seed_drills():
    """Insert or update all drills with embeddings."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async with async_session_factory() as db:
        for drill_data in DRILLS:
            # Check if drill already exists (by name)
            result = await db.execute(
                select(DrillLibrary).where(DrillLibrary.name == drill_data["name"])
            )
            existing = result.scalar_one_or_none()

            if existing:
                print(f"  [SKIP] {drill_data['name']} — already exists")
                continue

            # Generate embedding from the drill text
            drill_text = (
                f"Category: {drill_data['category'].value}. "
                f"Difficulty: {drill_data['difficulty'].value}. "
                f"Drill: {drill_data['name']}. "
                f"Description: {drill_data['description']}. "
                f"Equipment: {drill_data.get('equipment_needed', 'none')}. "
                f"Duration: {drill_data['duration_minutes']} minutes."
            )

            embedding_response = await client.embeddings.create(
                model="text-embedding-3-small",
                input=drill_text,
            )
            embedding = embedding_response.data[0].embedding

            drill = DrillLibrary(
                name=drill_data["name"],
                category=drill_data["category"],
                difficulty=drill_data["difficulty"],
                description=drill_data["description"],
                equipment_needed=drill_data.get("equipment_needed"),
                duration_minutes=drill_data["duration_minutes"],
                embedding=embedding,
            )
            db.add(drill)
            print(f"  [ADDED] {drill_data['name']} ({drill_data['category'].value}, {drill_data['difficulty'].value})")

        await db.commit()
        print(f"\n✅ Seeded {len(DRILLS)} drills total (skipped duplicates).")


if __name__ == "__main__":
    print("🌱 Seeding drill_library...\n")
    asyncio.run(seed_drills())
