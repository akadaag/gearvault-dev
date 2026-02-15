# AI Model Accuracy Test Suite

Test the `google-ai-studio/gemini-2.0-flash-lite` model with these 7 prompts to evaluate JSON reliability, context understanding, and gear selection quality.

## How to Test

1. Go to AI Assistant page in the app
2. Enter each prompt exactly as written below
3. Click "Generate Packing List"
4. Record results in the table at the bottom

---

## Test 1: Music Video Shoot (Critical Exclusion Test)
**Goal:** Verify model EXCLUDES audio gear for music video (pre-recorded music)

**Prompt:**
```
Music video shoot in an abandoned warehouse. 6-hour shoot with tracking shots and dynamic camera movement. Dark industrial setting with mixed lighting. Need cinematic look with smooth movement.
```

**Expected Behavior:**
- ✅ Includes: Gimbal (for tracking shots)
- ✅ Includes: LED continuous lights (video = continuous light)
- ✅ Includes: Cinema/video-first camera as primary
- ✅ Includes: Wide-angle lens for warehouse shots
- ❌ EXCLUDES: All audio gear (mics, recorders, audio cables) — music is pre-recorded
- ❌ EXCLUDES: Flash/strobe (video uses continuous lighting)

**Pass Criteria:** 
- Zero audio gear in recommended_items
- At least one gimbal recommended
- At least one LED/continuous light source

---

## Test 2: Natural Light Portrait (Lighting Exclusion Test)
**Goal:** Verify model EXCLUDES powered lights when natural light is specified

**Prompt:**
```
Outdoor portrait session in golden hour. Natural light only, using reflectors for fill. 2-hour session in a park. Need shallow depth of field and bokeh.
```

**Expected Behavior:**
- ✅ Includes: Photo-first or hybrid camera
- ✅ Includes: Fast prime lenses (f/1.4, f/1.8, f/2.8)
- ✅ Includes: Reflector (natural light modifier)
- ❌ EXCLUDES: All powered lights (LED panels, flash, strobe)
- ❌ EXCLUDES: Gimbal (photo session, not video)

**Pass Criteria:**
- Zero powered lights in recommended_items (reflector is OK)
- At least one fast lens (aperture ≤ f/2.8)
- No gimbal recommended

---

## Test 3: Full-Day Wedding (Completeness Test)
**Goal:** Verify model generates comprehensive list (12-18+ items) with proper priority escalation

**Prompt:**
```
Full-day wedding coverage. Ceremony at 2pm in a dimly lit church, reception at 6pm in a ballroom with mixed lighting. Need both photo and video coverage. High-stakes event, can't afford gear failure.
```

**Expected Behavior:**
- ✅ Includes: 12-18+ items total (comprehensive list)
- ✅ Includes: Backup camera body as "Must-have" (high-stakes)
- ✅ Includes: Multiple batteries as "Must-have" (full-day)
- ✅ Includes: Multiple memory cards as "Must-have" (full-day)
- ✅ Includes: Flash/strobe as "Must-have" (dimly lit church)
- ✅ Includes: Both photo and video gear (hybrid event)
- ✅ Includes: Both camera bodies marked as "primary" if equally suited

**Pass Criteria:**
- At least 12 items recommended
- Backup camera is "Must-have"
- Flash is "Must-have"
- At least 2 batteries and 2 memory cards

---

## Test 4: Corporate Video Interview (Role Assignment Test)
**Goal:** Verify proper role assignment (primary/backup/alternative) for video-first event

**Prompt:**
```
Corporate interview video for LinkedIn. Studio setting with controlled lighting. 3 speakers, need multi-camera setup. 4-hour session. Clean audio is critical.
```

**Expected Behavior:**
- ✅ Includes: Cinema/video-first camera as "primary"
- ✅ Includes: Second camera as "backup" or "alternative"
- ✅ Includes: Microphone as "primary" with clear audio role
- ✅ Includes: LED continuous lights (video = continuous)
- ✅ Includes: Tripod (static shots, not gimbal)
- ✅ Includes: Audio gear (recorder, mic, cables) — interview requires clean audio
- ❌ EXCLUDES: Flash (video uses continuous lighting)

**Pass Criteria:**
- At least one camera with role="primary"
- Audio gear included (microphone is critical)
- Tripod recommended, not gimbal

---

## Test 5: Travel Photography Trip (EventFit Matching Test)
**Goal:** Verify model prioritizes items with eventFit="travel" and strengths="portability"

**Prompt:**
```
3-day travel photography trip to Iceland. Backpacking with weight restrictions. Landscape, wildlife, and aurora photography. Need versatile lightweight gear.
```

**Expected Behavior:**
- ✅ Includes: Items with eventFit matching "travel" or "landscape"
- ✅ Includes: Items with strengths="portability" ranked higher
- ✅ Includes: Tripod (landscape/aurora long exposures)
- ✅ Includes: Wide-angle lens (landscape)
- ✅ Includes: Telephoto lens (wildlife)
- ✅ Avoids: Heavy cinema gear, bulky lights, excessive accessories

**Pass Criteria:**
- Gear selected has eventFit matching "travel" or "landscape"
- Reason field references "portability" or "lightweight"
- Tripod included for long exposures

---

## Test 6: Low-Light Concert (Strengths Matching Test)
**Goal:** Verify model ranks items with strengths="low-light" higher for dark venues

**Prompt:**
```
Concert photography in a dark club. No flash allowed, stage lights only. Fast-moving performers. Need to capture energy and emotion in low light.
```

**Expected Behavior:**
- ✅ Includes: Camera with strengths="low-light" (high ISO performance)
- ✅ Includes: Fast lenses (f/1.4, f/1.8, f/2.8) for low light
- ✅ Includes: Items with eventFit="concert" or "low-light"
- ❌ EXCLUDES: Flash (not allowed)
- ❌ EXCLUDES: Tripod (fast-moving performers, need mobility)

**Pass Criteria:**
- Reason field references "low-light" capability
- At least one fast lens (f/2.8 or wider)
- No flash recommended

---

## Test 7: Real Estate Video Walkthrough (Section Assignment Test)
**Goal:** Verify proper section assignment (tripods → Support, NOT Misc)

**Prompt:**
```
Real estate video walkthrough for luxury home listing. Smooth stabilized footage walking through rooms. Wide-angle shots to show space. 2-hour shoot.
```

**Expected Behavior:**
- ✅ Includes: Gimbal assigned to section="Support" (NOT "Misc")
- ✅ Includes: Wide-angle lens (show space)
- ✅ Includes: Video-first or hybrid camera
- ✅ Includes: LED continuous light (video = continuous)
- ❌ EXCLUDES: Flash (video uses continuous lighting)
- ❌ EXCLUDES: Tripod (need movement, not static shots)

**Pass Criteria:**
- Gimbal is in section="Support" (never "Misc")
- Wide-angle lens included
- No tripod (gimbal for movement)

---

## Results Tracking Table

| Test # | Test Name | JSON Valid? | Critical Exclusions Pass? | Expected Inclusions Pass? | Section Assignment Correct? | Overall Pass/Fail |
|--------|-----------|-------------|---------------------------|---------------------------|----------------------------|-------------------|
| 1 | Music Video (Audio Exclusion) | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |
| 2 | Natural Light Portrait | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |
| 3 | Full-Day Wedding | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |
| 4 | Corporate Interview | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |
| 5 | Travel Photography | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |
| 6 | Low-Light Concert | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |
| 7 | Real Estate Walkthrough | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Yes ☐ No | ☐ Pass ☐ Fail |

---

## Scoring

**Overall Accuracy = (Total Passes / 7) × 100%**

**Acceptable Thresholds:**
- 95-100% (7/7 or 6.5/7) = Excellent, production-ready
- 85-94% (6/7) = Good, acceptable for production
- 70-84% (5/7) = Needs improvement, consider fallback model
- <70% (<5/7) = Poor, model not suitable for this use case

---

## Notes Section

Record any observations:
- First-request failure still occurring? (Y/N)
- Average response time: ___ seconds
- Any unexpected behavior:
- Any JSON parsing errors:
