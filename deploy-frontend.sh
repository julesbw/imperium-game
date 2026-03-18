#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-frontend.sh — Build y deploy de Imperium Frontend a S3 + CloudFront
# Uso: ./deploy-frontend.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Detener si cualquier comando falla

# ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
BUCKET_NAME="imperium-frontend"        # Nombre del bucket S3 (debe ser único globalmente)
AWS_REGION="us-east-1"                 # Región donde crear el bucket
FRONTEND_DIR="./imperium-frontend"     # Ruta al proyecto React (ajusta si es necesario)

# ── COLORES ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No color

log()     { echo -e "${CYAN}[IMPERIUM]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── 1. VERIFICAR DEPENDENCIAS ─────────────────────────────────────────────────
log "Verificando dependencias..."
command -v aws  >/dev/null 2>&1 || error "AWS CLI no instalado. Instálalo en: https://aws.amazon.com/cli/"
command -v npm  >/dev/null 2>&1 || error "npm no instalado."
command -v node >/dev/null 2>&1 || error "Node.js no instalado."
success "Dependencias OK"

# ── 2. BUILD ──────────────────────────────────────────────────────────────────
log "Construyendo el frontend..."
cd "$FRONTEND_DIR"
npm install --silent
npm run build
cd ..
success "Build completado → dist/"

# ── 3. CREAR BUCKET S3 (si no existe) ─────────────────────────────────────────
log "Verificando bucket S3: $BUCKET_NAME"
if aws s3 ls "s3://$BUCKET_NAME" 2>&1 | grep -q 'NoSuchBucket'; then
  log "Creando bucket S3..."
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$AWS_REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
  fi
  success "Bucket creado: $BUCKET_NAME"
else
  success "Bucket ya existe: $BUCKET_NAME"
fi

# ── 4. CONFIGURAR BUCKET PARA SITIO ESTÁTICO ──────────────────────────────────
log "Configurando bucket para hosting estático..."

# Deshabilitar bloqueo de acceso público
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Política para acceso público de lectura
aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"PublicReadGetObject\",
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::$BUCKET_NAME/*\"
  }]
}"

# Configurar como sitio estático
aws s3 website "s3://$BUCKET_NAME" \
  --index-document index.html \
  --error-document index.html

success "Bucket configurado como sitio estático"

# ── 5. SUBIR ARCHIVOS ─────────────────────────────────────────────────────────
log "Subiendo archivos a S3..."

# Subir assets con cache largo (JS, CSS, imágenes)
aws s3 sync "$FRONTEND_DIR/dist/" "s3://$BUCKET_NAME/" \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete \
  --quiet

# Subir index.html sin cache (siempre fresco)
aws s3 cp "$FRONTEND_DIR/dist/index.html" "s3://$BUCKET_NAME/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

success "Archivos subidos a S3"

# ── 6. CLOUDFRONT ─────────────────────────────────────────────────────────────
log "Verificando distribución CloudFront..."

DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[0].DomainName=='${BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com'].Id" \
  --output text 2>/dev/null)

if [ -z "$DISTRIBUTION_ID" ] || [ "$DISTRIBUTION_ID" = "None" ]; then
  warn "No se encontró distribución CloudFront. Creando..."

  DISTRIBUTION_ID=$(aws cloudfront create-distribution --distribution-config "{
    \"CallerReference\": \"imperium-$(date +%s)\",
    \"Comment\": \"Imperium Game Frontend\",
    \"DefaultRootObject\": \"index.html\",
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"Id\": \"S3-imperium\",
        \"DomainName\": \"${BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com\",
        \"CustomOriginConfig\": {
          \"HTTPPort\": 80,
          \"HTTPSPort\": 443,
          \"OriginProtocolPolicy\": \"http-only\"
        }
      }]
    },
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"S3-imperium\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"Compress\": true,
      \"AllowedMethods\": {
        \"Quantity\": 2,
        \"Items\": [\"GET\", \"HEAD\"]
      }
    },
    \"CustomErrorResponses\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"ErrorCode\": 404,
        \"ResponsePagePath\": \"/index.html\",
        \"ResponseCode\": \"200\",
        \"ErrorCachingMinTTL\": 0
      }]
    },
    \"Enabled\": true,
    \"PriceClass\": \"PriceClass_100\"
  }" --query "Distribution.Id" --output text)

  success "Distribución CloudFront creada: $DISTRIBUTION_ID"
  warn "CloudFront tarda ~10 min en propagarse la primera vez."
else
  # Invalidar cache para que sirva los archivos nuevos
  log "Invalidando cache de CloudFront..."
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text > /dev/null
  success "Cache invalidado"
fi

# ── 7. URLS FINALES ───────────────────────────────────────────────────────────
S3_URL="http://${BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com"
CF_DOMAIN=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Id=='${DISTRIBUTION_ID}'].DomainName" \
  --output text 2>/dev/null)

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ⚜️  IMPERIUM DEPLOYED SUCCESSFULLY  ⚜️  ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}S3 URL:${NC}          $S3_URL"
[ -n "$CF_DOMAIN" ] && echo -e "  ${CYAN}CloudFront URL:${NC}  https://$CF_DOMAIN"
echo ""
echo -e "  ${YELLOW}Para futuros deploys simplemente corre:${NC}"
echo -e "  ${CYAN}./deploy-frontend.sh${NC}"
echo ""
