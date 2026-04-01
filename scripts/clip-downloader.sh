#!/bin/bash

# PodDNA Clip Downloader Script
# Downloads viral moment clips using yt-dlp and uploads them back to the server

set -e

# Configuration - Edit these values
API_KEY="${PODDNA_API_KEY:-}"
SERVER="${PODDNA_SERVER:-https://your-app.replit.app}"
OUTPUT_DIR="${PODDNA_OUTPUT_DIR:-./clips}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  PodDNA Clip Downloader${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

check_requirements() {
    if ! command -v yt-dlp &> /dev/null; then
        echo -e "${RED}Error: yt-dlp is not installed${NC}"
        echo "Install it with: pip install yt-dlp"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: curl is not installed${NC}"
        exit 1
    fi
    
    if [ -z "$API_KEY" ]; then
        echo -e "${RED}Error: API key not set${NC}"
        echo "Set it with: export PODDNA_API_KEY='your_key_here'"
        exit 1
    fi
}

format_time() {
    local seconds=$1
    printf "%02d:%02d:%02d" $((seconds/3600)) $((seconds%3600/60)) $((seconds%60))
}

fetch_pending_clips() {
    echo -e "${YELLOW}Fetching pending clips from server...${NC}" >&2
    local response=$(curl -s -H "X-Admin-API-Key: $API_KEY" "$SERVER/api/admin/viral-moments/pending-clips?limit=50")
    
    if echo "$response" | grep -q '"message"'; then
        echo -e "${RED}Error: $(echo "$response" | grep -o '"message":"[^"]*"')${NC}" >&2
        exit 1
    fi
    
    echo "$response"
}

list_clips() {
    local clips=$(fetch_pending_clips)
    local count=$(echo "$clips" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).length)" 2>/dev/null || echo "0")
    
    echo -e "${GREEN}Found $count pending clips${NC}"
    echo ""
    
    echo "$clips" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
data.forEach((m, i) => {
    const hasYT = m.videoUrl ? '✓' : '✗';
    const status = m.clipStatus === 'failed' ? '(RETRY)' : '';
    console.log(\`[\${i+1}] \${m.id.slice(0,8)}... | Score: \${m.viralityScore} | YT: \${hasYT} | \${m.episodeTitle?.slice(0,40) || 'Unknown'}... \${status}\`);
});"
}

download_clip() {
    local clip_id=$1
    local clips=$(fetch_pending_clips)
    
    local clip_data=$(echo "$clips" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const clip = data.find(c => c.id === '$clip_id' || c.id.startsWith('$clip_id'));
if (clip) {
    console.log(JSON.stringify(clip));
} else {
    console.error('Clip not found');
    process.exit(1);
}")
    
    if [ -z "$clip_data" ]; then
        echo -e "${RED}Clip not found: $clip_id${NC}"
        return 1
    fi
    
    local full_id=$(echo "$clip_data" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).id)")
    local video_url=$(echo "$clip_data" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).videoUrl || '')")
    local start_time=$(echo "$clip_data" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).startTime)")
    local end_time=$(echo "$clip_data" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).endTime)")
    local episode=$(echo "$clip_data" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).episodeTitle || 'Unknown')")
    
    if [ -z "$video_url" ]; then
        echo -e "${RED}No YouTube URL for this clip${NC}"
        return 1
    fi
    
    echo -e "${BLUE}Downloading clip:${NC}"
    echo "  Episode: $episode"
    echo "  Time: $(format_time $start_time) - $(format_time $end_time)"
    echo "  URL: $video_url"
    echo ""
    
    mkdir -p "$OUTPUT_DIR"
    local output_file="$OUTPUT_DIR/${full_id}.mp4"
    
    local start_fmt=$(format_time $start_time)
    local end_fmt=$(format_time $end_time)
    
    echo -e "${YELLOW}Running yt-dlp...${NC}"
    yt-dlp --download-sections "*${start_fmt}-${end_fmt}" \
           -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
           --merge-output-format mp4 \
           -o "$output_file" \
           "$video_url"
    
    if [ -f "$output_file" ]; then
        echo -e "${GREEN}Downloaded: $output_file${NC}"
        echo ""
        read -p "Upload this clip to server? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            upload_clip "$full_id" "$output_file"
        fi
    else
        echo -e "${RED}Download failed${NC}"
        return 1
    fi
}

upload_clip() {
    local clip_id=$1
    local file_path=$2
    
    echo -e "${YELLOW}Uploading $file_path...${NC}"
    
    local response=$(curl -s -X POST \
        -H "X-Admin-API-Key: $API_KEY" \
        -F "file=@$file_path" \
        "$SERVER/api/admin/viral-moments/$clip_id/upload-clip")
    
    if echo "$response" | grep -q '"error"'; then
        echo -e "${RED}Upload failed: $response${NC}"
        return 1
    else
        echo -e "${GREEN}Upload successful!${NC}"
        echo "$response"
    fi
}

download_all() {
    local clips=$(fetch_pending_clips)
    
    echo "$clips" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const withYT = data.filter(c => c.videoUrl);
console.log(JSON.stringify(withYT));" | while read -r clip_json; do
        if [ -n "$clip_json" ] && [ "$clip_json" != "[]" ]; then
            echo "$clip_json" | node -e "
const clips = JSON.parse(require('fs').readFileSync(0, 'utf8'));
clips.forEach(c => console.log(c.id));" | while read -r clip_id; do
                if [ -n "$clip_id" ]; then
                    echo -e "${BLUE}Processing: $clip_id${NC}"
                    download_clip "$clip_id" || true
                    echo ""
                fi
            done
        fi
    done
}

test_connection() {
    echo -e "${YELLOW}Testing connection to $SERVER...${NC}"
    local response=$(curl -s -w "\n%{http_code}" -H "X-Admin-API-Key: $API_KEY" "$SERVER/api/admin/health")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}Connection successful!${NC}"
        echo "$body" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('  Status:', d.status);console.log('  Auth:', d.authMethod);console.log('  Time:', d.timestamp);"
        return 0
    elif [ "$http_code" = "401" ]; then
        echo -e "${RED}Authentication failed - check your API key${NC}"
        return 1
    else
        echo -e "${RED}Connection failed (HTTP $http_code)${NC}"
        echo "Response: $body"
        return 1
    fi
}

show_help() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  test              Test connection and API key"
    echo "  list              List all pending clips"
    echo "  download <id>     Download a specific clip (can use partial ID)"
    echo "  upload <id> <file> Upload a clip file"
    echo "  all               Download all clips with YouTube URLs"
    echo "  help              Show this help"
    echo ""
    echo "Environment variables (set in .env file or shell profile):"
    echo "  PODDNA_API_KEY    Your admin API key (required)"
    echo "  PODDNA_SERVER     Server URL (default: https://your-app.replit.app)"
    echo "  PODDNA_OUTPUT_DIR Output directory for clips (default: ./clips)"
    echo ""
    echo "Setup:"
    echo "  1. Create a .env file with your credentials (keep it private):"
    echo "     echo 'export PODDNA_API_KEY=your_key' > ~/.poddna_env"
    echo "     chmod 600 ~/.poddna_env"
    echo "  2. Source it before running: source ~/.poddna_env"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 download 7fbb33ee"
    echo "  $0 upload 7fbb33ee-0a6a-4230-96d7-b1dfa2e273d5 ./clips/video.mp4"
}

# Main
print_header
check_requirements

case "${1:-list}" in
    test)
        test_connection
        ;;
    list)
        list_clips
        ;;
    download)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Clip ID required${NC}"
            echo "Usage: $0 download <clip_id>"
            exit 1
        fi
        download_clip "$2"
        ;;
    upload)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo -e "${RED}Error: Clip ID and file path required${NC}"
            echo "Usage: $0 upload <clip_id> <file_path>"
            exit 1
        fi
        upload_clip "$2" "$3"
        ;;
    all)
        download_all
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
