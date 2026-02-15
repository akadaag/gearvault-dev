# AI Assistant Testing Guide

## Setup Instructions

1. **Open the app**: http://localhost:5173/
2. **Load demo data**: Go to Settings → scroll to "Demo Data" → click "Load Demo Data"
3. **Navigate to AI Assistant**: Click "AI Pack" in the sidebar

You now have **30 realistic items** in your catalog covering cameras, lenses, audio, lighting, support gear, and accessories.

---

## Test Cases - Detailed

### Test 1: Corporate Interview (Video Event)

**Prompt to use:**
```
Corporate interview with 2 speakers in an indoor office. Full-day shoot, need professional audio and stable shots.
```

**Click**: "✦ Generate Checklist"

**Expected Loading Sequence:**
1. "Classifying gear items…" (~2s)
2. "Generating your packing list…" (~6-8s)
3. "Matching items to your catalog…" (instant)

**Expected Results:**

#### Camera Bodies Section:
- ✅ **Sony FX30** → `primary` badge (teal) + `Must-have` priority
  - *Why*: video_first camera with eventFit: ["corporate", "interview"]
- ✅ **Sony A7 IV** or **A7S III** → `backup` badge (blue) + `Nice-to-have` priority
  - *Why*: Hybrid/video camera as backup

#### Lenses Section:
- ✅ **Tamron 17-28mm f/2.8** → `Must-have`
  - *Why*: Wide angle for interview setup, eventFit: ["corporate", "interview"]
- ✅ **Sony 24-70mm f/2.8 GM II** → `Must-have` or `Nice-to-have`
  - *Why*: Versatile zoom for multiple angles

#### Audio Section:
- ✅ **Rode Wireless Go II** → `primary` badge (teal) + `Must-have`
  - *Why*: Wireless lav for interview audio, eventFit: ["interview", "corporate"]
- ✅ **Rode VideoMic NTG** or **Zoom H6** → `backup` or `alternative`
  - *Why*: Backup audio capture

#### Lighting Section:
- ✅ **Godox SL-60W** → `Must-have` or `Nice-to-have`
  - *Why*: Continuous LED for video, eventFit: ["corporate", "interview"]
- ✅ **Aputure MC Pro** → `Nice-to-have` or `Optional`
  - *Why*: Compact fill/accent light

#### Support Section:
- ✅ **Manfrotto 190 Tripod** → `Must-have`
  - *Why*: Stable shots for interview

#### Power/Media:
- ✅ **NP-FZ100 Batteries** → `Must-have`
- ✅ **CFexpress Type A cards** → `Must-have`

#### Tips Section:
- Check audio levels before interview
- Bring extra batteries for all-day shoot
- Set up 2-camera angles for editing options
- Test wireless mics for interference

---

### Test 2: Wedding (Photo/Video Hybrid)

**Prompt to use:**
```
Full-day wedding coverage. Ceremony in a dark church, outdoor portraits during golden hour, evening reception. Need both photo and video.
```

**Expected Results:**

#### Camera Bodies Section:
- ✅ **Sony A7 IV** → `primary` badge + `Must-have`
  - *Why*: Hybrid camera, eventFit: ["wedding", "portrait", "event"]
- ✅ **Canon R5** → `backup` badge + `Nice-to-have`
  - *Why*: Photo-first backup with high resolution
- ✅ **Sony A7S III** or **FX30** → `alternative` badge + `Nice-to-have`
  - *Why*: Video-optimized for ceremony/reception coverage

#### Lenses Section:
- ✅ **Sony 24-70mm f/2.8 GM II** → `Must-have`
- ✅ **Sony 70-200mm f/2.8 GM II** → `Must-have`
  - *Why*: Essential wedding zoom range, compression for portraits
- ✅ **Sony 85mm f/1.8** or **Canon RF 50mm f/1.2** → `Must-have` or `Nice-to-have`
  - *Why*: Portrait lens for shallow DOF, eventFit: ["wedding", "portrait"]
- ✅ **Sigma 35mm f/1.4** → `Nice-to-have`
  - *Why*: Low-light prime for dark church

#### Lighting Section:
- ✅ **Godox V1 Flash** → `Must-have`
  - *Why*: eventFit: ["wedding", "indoor"]
- ✅ **5-in-1 Reflector** → `Nice-to-have`
  - *Why*: For outdoor portrait session

#### Audio Section:
- ✅ **Rode Wireless Go II** → `primary` + `Nice-to-have`
  - *Why*: Capture vows/speeches if doing video

#### Support:
- ✅ **Peak Design Travel Tripod** → `Nice-to-have`
- ✅ **DJI RS 3 Pro Gimbal** → `Optional`
  - *Why*: Smooth video for walking shots

#### Power/Media:
- ✅ **NP-FZ100 Batteries** (quantity: 4-6) → `Must-have`
- ✅ **SD UHS-II cards** (quantity: 3-4) → `Must-have`
- ✅ **CFexpress cards** → `Must-have`

#### Tips:
- Scout the church beforehand for low-light conditions
- Bring extra memory cards - weddings generate large files
- Use fast prime lenses (f/1.4-1.8) for dark church
- Golden hour timing: arrive 90 minutes before sunset
- Have backup batteries for flash - reception can drain fast

---

### Test 3: Outdoor Portrait Session

**Prompt to use:**
```
2-hour outdoor portrait session at golden hour. Natural light lifestyle portraits with a single subject. Beautiful bokeh desired.
```

**Expected Results:**

#### Camera Bodies Section:
- ✅ **Canon R5** or **Sony A7 IV** → `primary` + `Must-have`
  - *Why*: Photo-first or hybrid with high resolution, eventFit: ["portrait", "outdoor"]
- ✅ NO video-first cameras (FX30, A7S III should be absent or marked `optional`)

#### Lenses Section:
- ✅ **Sony 85mm f/1.8** or **Canon RF 50mm f/1.2** → `Must-have`
  - *Why*: Portrait focal length, shallow DOF, eventFit: ["portrait"]
- ✅ **Sigma 35mm f/1.4** → `Nice-to-have`
  - *Why*: Wider environmental portraits
- ✅ NO wide zooms (17-28mm should be absent)

#### Lighting Section:
- ✅ **5-in-1 Reflector** → `Nice-to-have` or `Optional`
  - *Why*: Natural light modifier, eventFit: ["portrait", "outdoor"]
- ✅ NO video lights (Godox SL-60W, Aputure MC should be absent)

#### Audio Section:
- ✅ **COMPLETELY ABSENT** - no audio gear for photo session

#### Support:
- ✅ **Peak Design Travel Tripod** → `Optional`
  - *Why*: Lightweight for location work
- ✅ NO gimbal (DJI RS 3 Pro should be absent - this is photo, not video)

#### Power/Media:
- ✅ **SD UHS-II cards** → `Must-have`
- ✅ **NP-FZ100 Batteries** (quantity: 2-3) → `Must-have`

#### Tips:
- Arrive 30-60 minutes before sunset for best light
- Use reflector to fill shadows and add catch lights
- Shoot wide open (f/1.2-2.8) for bokeh
- Position subject with light at 45° angle
- Bring extra batteries - cold weather drains fast

---

### Test 4: Real Estate Video Tour

**Prompt to use:**
```
Real estate video tour of 3 properties. Indoor shots with wide angles, need smooth camera movement and stabilization.
```

**Expected Results:**

#### Camera Bodies Section:
- ✅ **Sony FX30** → `primary` + `Must-have`
  - *Why*: video_first, eventFit: ["real-estate"]

#### Lenses Section:
- ✅ **Tamron 17-28mm f/2.8** or **Sony 16-35mm f/4 PZ G** → `Must-have`
  - *Why*: Ultra-wide for interior spaces, eventFit: ["real-estate"]
- ✅ NO telephoto lenses (70-200mm should be absent)

#### Support:
- ✅ **DJI RS 3 Pro Gimbal** → `Must-have` or `Nice-to-have`
  - *Why*: Smooth walking shots through properties
- ✅ **Manfrotto Tripod** → `Nice-to-have`

#### Lighting:
- ✅ **Godox SL-60W** → `Nice-to-have`
  - *Why*: eventFit: ["real-estate", "indoor"]

#### Audio:
- ✅ **Rode VideoMic NTG** → `Optional`
  - *Why*: Voiceover if doing narrated tours

---

### Test 5: Music Video Shoot

**Prompt to use:**
```
Music video shoot in an industrial warehouse. Need cinematic look with movement, RGB lighting for creative effects.
```

**Expected Results:**

#### Camera Bodies:
- ✅ **Sony A7S III** or **FX30** → `primary` + `Must-have`
  - *Why*: Cinematic video cameras, eventFit: ["music-video"]

#### Lenses:
- ✅ **Sony 24-70mm f/2.8 GM II** → `Must-have`
  - *Why*: Versatile zoom for different shots
- ✅ **Sigma 35mm f/1.4** → `Nice-to-have`
  - *Why*: Cinematic FOV, low-light

#### Lighting:
- ✅ **Aputure MC Pro** (quantity: 2) → `Must-have` or `Nice-to-have`
  - *Why*: RGB effects, eventFit: ["music-video"]
- ✅ **Godox SL-60W** → `Nice-to-have`

#### Support:
- ✅ **DJI RS 3 Pro Gimbal** → `Must-have`
  - *Why*: Smooth movement shots, eventFit: ["music-video"]

#### Audio:
- ✅ NO audio gear (music is pre-recorded)

---

## What to Check During Testing

### ✅ Correct Behavior (GREEN FLAGS)

| Check | What It Means |
|-------|---------------|
| Video event → FX30/A7S III gets `primary` badge | Safety guard + eventFit matching working |
| Photo event → R5/A7 IV gets `primary` badge | eventFit matching working correctly |
| Audio gear has role badges | Role assignment working for Audio section |
| Items show `✓ matched` badge | Catalog matcher successfully linked items |
| Sections appear in correct order | Essentials → Camera Bodies → Lenses → ... → Misc |
| Priority badges (Must-have, Nice-to-have, Optional) | AI understanding importance correctly |
| Relevant tips appear | AI providing contextual advice |
| NO questions popup | Follow-up questions feature successfully removed |

### ❌ Red Flags (REPORT THESE)

| Issue | Problem |
|-------|---------|
| Corporate interview → Canon R5 gets `primary` | Should be FX30 (video_first) |
| Portrait session includes audio gear | AI over-recommending |
| Items in wrong sections | Section assignment broken |
| No `primary` badges on cameras | Role assignment not working |
| Review sheet appears for exact name matches | Catalog matcher confidence too low |
| Long loading times (>15 seconds) | Rate limiting or slow AI response |
| Error messages about rate limits | Too many requests too fast |
| Empty results or missing sections | AI response parsing broken |

---

## How the Flow Works (Behind the Scenes)

### Step-by-Step Breakdown

1. **You type event description** → Click "Generate Checklist"

2. **Background classification runs** (2-4s)
   - Scans catalog for items missing `eventFit` or `strengths`
   - Uses **llama-3.1-8b-instant** (FAST model)
   - Demo data already has all metadata → this is instant

3. **Packing list generation** (6-8s)
   - Optimized catalog sent to **llama-4-scout-17b** (BALANCED model)
   - AI does event-suitability matching:
     - Event needs: `["corporate", "interview"]`
     - FX30 has: `eventFit: ["corporate", "interview", "documentary"]`
     - **MATCH** → assign `role: "primary"`

4. **Safety guard** (instant, client-side)
   - If event type contains "video/interview/corporate"
   - Verify `video_first` camera is `primary`
   - Auto-correct if AI made mistake

5. **Catalog matcher** (instant, client-side)
   - Fuzzy match AI names to your real catalog
   - ≥0.80 similarity → auto-link with `✓ matched` badge
   - 0.60-0.79 → review sheet (you pick)
   - <0.60 → moved to "Consider buying/renting"

6. **Results displayed**
   - Items grouped by section (canonical order)
   - Camera Bodies & Audio show role badges
   - Priority badges on all items
   - Tips at bottom

---

## Expected Performance

| Metric | Target | Acceptable Range |
|--------|--------|------------------|
| Classification (per item) | 2-4s | Up to 6s |
| Packing list generation | 6-8s | Up to 12s |
| Total time (input → results) | 8-10s | Up to 15s |
| Catalog matcher | <500ms | Up to 1s |

---

## Notes

- **No questions popup should appear** - that feature was completely removed
- **All 30 items have full metadata** - eventFit, strengths, capabilities, inferredProfile
- **Role badges only appear** on Camera Bodies and Audio sections
- **Tips should be relevant** to the specific event type
- **Missing items suggestions** should make sense (e.g., "Wireless lav mic" for interview)

---

## After Testing

**Report back:**
1. Which test cases worked perfectly?
2. Which had issues (wrong camera as primary, missing items, etc.)?
3. Any unexpected errors or long loading times?
4. Overall quality compared to expectations?
