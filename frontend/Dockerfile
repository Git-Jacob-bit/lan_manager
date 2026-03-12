# Etap 1: Budowanie aplikacji (Node.js)
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etap 2: Serwowanie plików (Nginx)
FROM nginx:alpine
# Kopiujemy zbudowane pliki z poprzedniego etapu do folderu Nginxa
COPY --from=build /app/dist /usr/share/nginx/html
# Kopiujemy niestandardową konfigurację Nginxa (potrzebne dla React Routera)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]