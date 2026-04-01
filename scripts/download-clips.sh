#!/bin/bash

# PodDNA Clip Downloader - Local Script
# Usage: ./download-clips.sh [list|download|upload|test]

set -e  # Exit on error

# Load config if available
if [ -f "$HOME/.poddna/config.env" ]; then
  source "$HOME/.poddna/config.env"
fi

SERVER="${PODDNA_SERVER:-https://pod-genius-wayneselman.replit.app}"
API_KEY="${PODDNA_API_KEY:-}"
OUTPUT_DIR="${PODDNA_OUTPUT_DIR:-./clips}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
  echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║         PodDNA Clip Downloader                        ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

check_requirements() {
  if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: PODDNA_API_KEY not set${NC}"
    echo "Run setup-environment.sh first or set it manually:"
    echo "  export PODDNA_API_KEY='your_key_here'"
    exit 1
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo -e "${RED}Error: curl not installed${NC}"
    exit 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo -e "${RED}Error: jq not installed${NC}"
    echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
  fi
}

format_time() {
  local seconds=$1
  printf "%02d:%02d:%02d" $((seconds/3600)) $((seconds%3600/60)) $((seconds%60))
}

test_connection() {
  echo -e "${YELLOW}Testing connection to $SERVER...${NC}"
  
  RESPONSE=$(curl -s -w "\n%{http_code}" -H "X-Admin-API-Key: $API_KEY" "$SERVER/api/admin/health")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)
  
  if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ Connection successful${NC}"
    echo "$BODY" | jq -r '"  Status: " + .status + "\n  Auth: " + .authMethod + "\n  Time: " + .timestamp' 2>/dev/null
    return 0
  elif [ "$HTTP_CODE" == "401" ]; then
    echo -e "${RED}✗ Authentication failed - check your API key${NC}"
    return 1
  else
    echo -e "${RED}✗ Connection failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    return 1
  fi
}

list_clips() {
  echo -e "${YELLOW}Fetching pending clips from server...${NC}"
  
  RESPONSE=$(curl -s -H "X-Admin-API-Key: $API_KEY" "$SERVER/api/admin/viral-moments/pending-clips?limit=50")
  
  if echo "$RESPONSE" | grep -q '"message"'; then
    echo -e "${RED}Error: $(echo "$RESPONSE" | jq -r '.message')${NC}"
    exit 1
  fi
  
  COUNT=$(echo "$RESPONSE" | jq 'length')
  echo -e "${GREEN}Found $COUNT pending clips${NC}"
  echo ""
  
  echo "$RESPONSE" | jq -r '.[] | 
    "\(.id[0:8])... | Score: \(.viralityScore) | YT: \(if .videoUrl then "✓" else "✗" end) | \(.episodeTitle[0:40] // "Unknown")... \(if .clipStatus == "failed" then "(RETRY)" else "" end)"' | 
    nl -w2 -s'] '
}

download_clip() {
  local CLIP_ID=$1
  
  if [ -z "$CLIP_ID" ]; then
    echo -e "${RED}Error: Clip ID required${NC}"
    echo "Usage: $0 download <clip_id>"
    exit 1
  fi
  
  # Check for yt-dlp
  if ! command -v yt-dlp >/dev/null 2>&1; then
    echo -e "${RED}Error: yt-dlp not installed${NC}"
    echo "Install with: pip3 install yt-dlp"
    exit 1
  fi
  
  echo -e "${YELLOW}Fetching clip details...${NC}"
  
  RESPONSE=$(curl -s -H "X-Admin-API-Key: $API_KEY" "$SERVER/api/admin/viral-moments/pending-clips?limit=100")
  
  # Find the clip (support partial ID matching)
  CLIP=$(echo "$RESPONSE" | jq --arg id "$CLIP_ID" '.[] | select(.id | startswith($id))')
  
  if [ -z "$CLIP" ] || [ "$CLIP" == "null" ]; then
    echo -e "${RED}Clip not found: $CLIP_ID${NC}"
    exit 1
  fi
  
  FULL_ID=$(echo "$CLIP" | jq -r '.id')
  VIDEO_URL=$(echo "$CLIP" | jq -r '.videoUrl // empty')
  START_TIME=$(echo "$CLIP" | jq -r '.startTime')
  END_TIME=$(echo "$CLIP" | jq -r '.endTime')
  EPISODE=$(echo "$CLIP" | jq -r '.episodeTitle // "Unknown"')
  
  if [ -z "$VIDEO_URL" ]; then
    echo -e "${RED}No YouTube URL for this clip${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}Found clip:${NC}"
  echo "  ID: $FULL_ID"
  echo "  Episode: $EPISODE"
  echo "  Time: $(format_time $START_TIME) - $(format_time $END_TIME)"
  echo "  URL: $VIDEO_URL"
  echo ""
  
  # Create output directory
  mkdir -p "$OUTPUT_DIR"
  OUTPUT_FILE="$OUTPUT_DIR/${FULL_ID}.mp4"
  
  # Format times for yt-dlp
  START_FMT=$(format_time $START_TIME)
  END_FMT=$(format_time $END_TIME)
  
  echo -e "${BLUE}⬇️  Downloading...${NC}"
  
  if yt-dlp "$VIDEO_URL" \
    --download-sections "*${START_FMT}-${END_FMT}" \
    -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
    --merge-output-format mp4 \
    --no-playlist \
    -o "$OUTPUT_FILE" \
    --progress; then
    
    if [ -f "$OUTPUT_FILE" ]; then
      FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
      echo -e "${GREEN}✓ Downloaded: $OUTPUT_FILE ($FILE_SIZE)${NC}"
      echo ""
      
      read -p "Upload this clip to server? (y/n): " -n 1 -r
      echo ""
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        upload_clip "$FULL_ID" "$OUTPUT_FILE"
      fi
    else
      echo -e "${RED}✗ Download succeeded but file not found${NC}"
      exit 1
    fi
  else
    echo -e "${RED}✗ Download failed${NC}"
    exit 1
  fi
}

upload_clip() {
  local CLIP_ID=$1
  local FILE_PATH=$2
  
  if [ -z "$CLIP_ID" ] || [ -z "$FILE_PATH" ]; then
    echo -e "${RED}Error: Clip ID and file path required${NC}"
    echo "Usage: $0 upload <clip_id> <file_path>"
    exit 1
  fi
  
  if [ ! -f "$FILE_PATH" ]; then
    echo -e "${RED}Error: File not found: $FILE_PATH${NC}"
    exit 1
  fi
  
  FILE_SIZE=$(du -h "$FILE_PATH" | cut -f1)
  echo -e "${BLUE}⬆️  Uploading $FILE_PATH ($FILE_SIZE)...${NC}"
  
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "X-Admin-API-Key: $API_KEY" \
    -F "file=@$FILE_PATH" \
    "$SERVER/api/admin/viral-moments/$CLIP_ID/upload-clip")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)
  
  if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ Upload successful!${NC}"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  else
    echo -e "${RED}✗ Upload failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY" | jq -r '.error // .' 2>/dev/null || echo "$BODY"
    exit 1
  fi
}

batch_process() {
  local LIMIT=${1:-10}
  local KEEP_FILES=${2:-false}
  
  # Check for yt-dlp
  if ! command -v yt-dlp >/dev/null 2>&1; then
    echo -e "${RED}Error: yt-dlp not installed${NC}"
    echo "Install with: brew install yt-dlp (macOS) or pip3 install yt-dlp"
    exit 1
  fi
  
  echo -e "${YELLOW}Fetching up to $LIMIT pending clips...${NC}"
  
  RESPONSE=$(curl -s -H "X-Admin-API-Key: $API_KEY" "$SERVER/api/admin/viral-moments/pending-clips?limit=$LIMIT")
  
  if echo "$RESPONSE" | grep -q '"message"'; then
    echo -e "${RED}Error: $(echo "$RESPONSE" | jq -r '.message')${NC}"
    exit 1
  fi
  
  TOTAL=$(echo "$RESPONSE" | jq 'length')
  echo -e "${GREEN}Found $TOTAL clips to process${NC}"
  echo ""
  
  if [ "$TOTAL" -eq 0 ]; then
    echo -e "${YELLOW}No pending clips. You're all caught up!${NC}"
    exit 0
  fi
  
  # Create output directory
  mkdir -p "$OUTPUT_DIR"
  
  # Track stats
  SUCCESS=0
  FAILED=0
  SKIPPED=0
  
  # Process each clip
  echo "$RESPONSE" | jq -c '.[]' | while read -r CLIP; do
    FULL_ID=$(echo "$CLIP" | jq -r '.id')
    VIDEO_URL=$(echo "$CLIP" | jq -r '.videoUrl // empty')
    START_TIME=$(echo "$CLIP" | jq -r '.startTime')
    END_TIME=$(echo "$CLIP" | jq -r '.endTime')
    EPISODE=$(echo "$CLIP" | jq -r '.episodeTitle // "Unknown"' | head -c 40)
    TITLE=$(echo "$CLIP" | jq -r '.suggestedTitle // "Untitled"' | head -c 50)
    CLIP_STATUS=$(echo "$CLIP" | jq -r '.clipStatus // "pending"')
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "📹 ${YELLOW}$TITLE${NC}"
    echo -e "   Episode: $EPISODE"
    echo -e "   Time: $(format_time $START_TIME) - $(format_time $END_TIME) ($(( END_TIME - START_TIME ))s)"
    echo -e "   Status: $CLIP_STATUS"
    
    # Validate video URL
    if [ -z "$VIDEO_URL" ]; then
      echo -e "   ${YELLOW}⚠ No YouTube URL, skipping${NC}"
      continue
    fi
    
    # Validate timestamps
    if [ "$END_TIME" -le "$START_TIME" ]; then
      echo -e "   ${YELLOW}⚠ Invalid timestamps, skipping${NC}"
      continue
    fi
    
    OUTPUT_FILE="$OUTPUT_DIR/${FULL_ID}.mp4"
    START_FMT=$(format_time $START_TIME)
    END_FMT=$(format_time $END_TIME)
    
    # Download
    echo -e "   ${BLUE}⬇️  Downloading...${NC}"
    
    if yt-dlp "$VIDEO_URL" \
      --download-sections "*${START_FMT}-${END_FMT}" \
      -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
      --merge-output-format mp4 \
      --no-playlist \
      --no-warnings \
      --quiet \
      -o "$OUTPUT_FILE" \
      --force-overwrites 2>/dev/null; then
      
      if [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
        FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
        echo -e "   ${GREEN}✓ Downloaded ($FILE_SIZE)${NC}"
        
        # Upload
        echo -e "   ${BLUE}⬆️  Uploading...${NC}"
        
        UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
          -H "X-Admin-API-Key: $API_KEY" \
          -F "file=@$OUTPUT_FILE" \
          "$SERVER/api/admin/viral-moments/$FULL_ID/upload-clip")
        
        HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
        
        if [ "$HTTP_CODE" == "200" ]; then
          echo -e "   ${GREEN}✓ Uploaded successfully!${NC}"
          
          # Clean up unless keeping files
          if [ "$KEEP_FILES" != "true" ]; then
            rm -f "$OUTPUT_FILE"
          fi
        else
          echo -e "   ${RED}✗ Upload failed (HTTP $HTTP_CODE)${NC}"
        fi
      else
        echo -e "   ${RED}✗ Download failed - file empty${NC}"
      fi
    else
      echo -e "   ${RED}✗ Download failed${NC}"
    fi
  done
  
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}Batch processing complete!${NC}"
  
  if [ "$KEEP_FILES" == "true" ]; then
    echo -e "${BLUE}Clips saved in: $OUTPUT_DIR${NC}"
  fi
}

show_help() {
  echo "Usage: $0 [command] [options]"
  echo ""
  echo "Commands:"
  echo "  test                 Test connection and API key"
  echo "  list                 List all pending clips"
  echo "  batch [limit] [keep] Download & upload all pending clips automatically"
  echo "  download <id>        Download a specific clip (can use partial ID)"
  echo "  upload <id> <file>   Upload a clip file to server"
  echo "  help                 Show this help"
  echo ""
  echo "Environment variables:"
  echo "  PODDNA_SERVER        Server URL"
  echo "  PODDNA_API_KEY       Admin API key (from Replit secrets)"
  echo "  PODDNA_OUTPUT_DIR    Output directory (default: ./clips)"
  echo ""
  echo "Setup:"
  echo "  Run ./setup-environment.sh first to configure"
  echo ""
  echo "Examples:"
  echo "  $0 test                    # Test connection"
  echo "  $0 list                    # Show pending clips"
  echo "  $0 batch                   # Download & upload all (limit 10)"
  echo "  $0 batch 50                # Process up to 50 clips"
  echo "  $0 batch 10 keep           # Keep files after upload"
  echo "  $0 download 7fbb33ee       # Download clip by partial ID"
  echo "  $0 upload <full_id> file.mp4  # Upload a clip"
}

# Main
print_header
check_requirements

case "${1:-help}" in
  test)
    test_connection
    ;;
  list)
    list_clips
    ;;
  batch)
    batch_process "${2:-10}" "${3:-false}"
    ;;
  download)
    download_clip "$2"
    ;;
  upload)
    upload_clip "$2" "$3"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    show_help
    exit 1
    ;;
esac
