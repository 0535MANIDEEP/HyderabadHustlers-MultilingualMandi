#!/bin/bash

# Docker deployment script for Multilingual Mandi
# Supports development, staging, and production environments

set -e

# Configuration
ENVIRONMENT=${1:-development}
COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="multilingual-mandi"

echo "🐳 Starting Docker deployment for Multilingual Mandi"
echo "Environment: $ENVIRONMENT"

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo "❌ Docker Compose is not installed. Please install it first."
        exit 1
    fi
}

# Function to set up environment-specific configuration
setup_environment() {
    case $ENVIRONMENT in
        "production")
            COMPOSE_FILE="docker-compose.yml -f docker-compose.prod.yml"
            echo "📦 Using production configuration"
            ;;
        "staging")
            COMPOSE_FILE="docker-compose.yml"
            echo "📦 Using staging configuration"
            ;;
        "development")
            COMPOSE_FILE="docker-compose.yml"
            echo "📦 Using development configuration"
            ;;
        *)
            echo "❌ Invalid environment: $ENVIRONMENT"
            echo "Valid options: development, staging, production"
            exit 1
            ;;
    esac
}

# Function to create necessary directories
create_directories() {
    echo "📁 Creating necessary directories..."
    mkdir -p backend/logs
    mkdir -p nginx/ssl
    mkdir -p monitoring
}

# Function to build and start services
deploy_services() {
    echo "🏗️  Building and starting services..."
    
    # Build images
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    # Start services
    docker-compose -f $COMPOSE_FILE up -d
    
    echo "⏳ Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    check_service_health
}

# Function to check service health
check_service_health() {
    echo "🔍 Checking service health..."
    
    # Check backend health
    if curl -f http://localhost:5000/health > /dev/null 2>&1; then
        echo "✅ Backend service is healthy"
    else
        echo "❌ Backend service is not responding"
        show_logs "backend"
        exit 1
    fi
    
    # Check frontend health
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        echo "✅ Frontend service is healthy"
    else
        echo "❌ Frontend service is not responding"
        show_logs "frontend"
        exit 1
    fi
    
    # Check Redis health
    if docker-compose -f $COMPOSE_FILE exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis service is healthy"
    else
        echo "❌ Redis service is not responding"
        show_logs "redis"
        exit 1
    fi
}

# Function to show service logs
show_logs() {
    local service=$1
    echo "📋 Showing logs for $service:"
    docker-compose -f $COMPOSE_FILE logs --tail=20 $service
}

# Function to show deployment summary
show_summary() {
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "🌐 Service URLs:"
    echo "Frontend: http://localhost:3000"
    echo "Backend API: http://localhost:5000"
    echo "Health Check: http://localhost:5000/health"
    echo "Redis: localhost:6379"
    
    if [[ $ENVIRONMENT == "production" ]]; then
        echo "Nginx Proxy: http://localhost:80"
        echo "Monitoring: http://localhost:9090 (Prometheus)"
        echo "Dashboard: http://localhost:3001 (Grafana)"
    fi
    
    echo ""
    echo "📊 Service Status:"
    docker-compose -f $COMPOSE_FILE ps
    
    echo ""
    echo "🔧 Useful commands:"
    echo "View logs: docker-compose -f $COMPOSE_FILE logs -f [service]"
    echo "Stop services: docker-compose -f $COMPOSE_FILE down"
    echo "Restart service: docker-compose -f $COMPOSE_FILE restart [service]"
    echo "Scale service: docker-compose -f $COMPOSE_FILE up -d --scale backend=2"
}

# Function to cleanup on failure
cleanup_on_failure() {
    echo "🧹 Cleaning up failed deployment..."
    docker-compose -f $COMPOSE_FILE down --remove-orphans
    docker system prune -f
}

# Main deployment flow
main() {
    # Pre-flight checks
    check_docker
    check_docker_compose
    
    # Setup
    setup_environment
    create_directories
    
    # Deploy
    if deploy_services; then
        show_summary
    else
        cleanup_on_failure
        exit 1
    fi
}

# Handle script interruption
trap cleanup_on_failure INT TERM

# Run main function
main

echo ""
echo "✨ Multilingual Mandi is now running!"
echo "Visit http://localhost:3000 to access the application"