FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
